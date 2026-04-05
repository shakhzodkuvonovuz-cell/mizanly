# A12: Comments & Likes Audit

Scope: Comment and like/react logic across all content types (posts, reels, videos, threads, channel posts).

Files audited:
- `apps/api/src/modules/posts/posts.service.ts` (lines 899-1541)
- `apps/api/src/modules/posts/posts.controller.ts` (507 lines)
- `apps/api/src/modules/reels/reels.service.ts` (lines 669-895)
- `apps/api/src/modules/reels/reels.controller.ts`
- `apps/api/src/modules/videos/videos.service.ts` (lines 543-860, 1009-1043)
- `apps/api/src/modules/videos/videos.controller.ts`
- `apps/api/src/modules/threads/threads.service.ts` (lines 685-1002)
- `apps/api/src/modules/threads/threads.controller.ts`
- `apps/api/src/modules/channel-posts/channel-posts.service.ts` (lines 125-159)
- `apps/api/src/modules/channel-posts/channel-posts.controller.ts`
- `apps/api/src/modules/posts/dto/add-comment.dto.ts`
- `apps/api/src/modules/posts/dto/edit-comment.dto.ts`
- `apps/api/src/modules/reels/dto/create-comment.dto.ts`
- `apps/api/src/modules/videos/dto/create-video-comment.dto.ts`
- `apps/api/src/modules/threads/dto/add-reply.dto.ts`
- `apps/api/prisma/schema.prisma` (Comment, ReelComment, VideoComment, ThreadReply, reaction models)

---

## Findings

### [CRITICAL] A12-1 — Missing block/mute checks on likes and comments across 4 content types

**Affected methods:**
| Service | Method | Line | Block check | Mute check |
|---------|--------|------|-------------|------------|
| `threads.service.ts` | `like()` | 685 | NO | NO |
| `threads.service.ts` | `likeReply()` | 888 | NO | NO |
| `threads.service.ts` | `addReply()` | 927 | NO | NO |
| `reels.service.ts` | `like()` | 669 | NO | NO |
| `reels.service.ts` | `comment()` | 741 | NO | NO |
| `reels.service.ts` | `likeComment()` | 826 | NO | NO |
| `videos.service.ts` | `like()` | 543 | NO | NO |
| `videos.service.ts` | `dislike()` | 605 | NO | NO |
| `videos.service.ts` | `comment()` | 669 | NO | NO |
| `videos.service.ts` | `likeComment()` | 804 | NO | NO |
| `channel-posts.service.ts` | `like()` | 125 | NO | NO |
| `posts.service.ts` | `likeComment()` | 1494 | NO | NO |

**Comparison:** `posts.service.ts` `react()` (line 909-932) and `addComment()` (line 1311-1334) correctly check both block AND mute in both directions. All other content types skip this entirely.

**Impact:** A blocked user can still like/comment on the blocker's content. A user you muted can still leave comments on your reels, videos, and threads. This defeats the entire block/mute system for non-post content.

---

### [CRITICAL] A12-2 — Missing content moderation on reel comments

**File:** `reels.service.ts`, `comment()` method, line 741

Reel comment creation does NOT call `contentSafety.moderateText()`. Compare:
- `posts.service.ts` `addComment()` line 1338: **YES** (moderates)
- `posts.service.ts` `editComment()` line 1457: **YES** (moderates)
- `videos.service.ts` `comment()` line 675: **YES** (moderates)
- `threads.service.ts` `addReply()` line 933: **YES** (moderates)
- `reels.service.ts` `comment()` line 741: **NO** (skips moderation entirely)

**Impact:** Abusive, hate speech, or harmful content can be posted as reel comments without any moderation check. Reels are often the highest-traffic content type, making this the worst place to skip moderation.

---

### [HIGH] A12-3 — Missing self-like prevention on videos and channel posts

**Affected methods:**
| Service | Method | Line | Self-like check |
|---------|--------|------|-----------------|
| `posts.service.ts` | `react()` | 904 | YES |
| `posts.service.ts` | `likeComment()` | 1498 | YES |
| `threads.service.ts` | `like()` | 690 | YES |
| `threads.service.ts` | `likeReply()` | 892 | YES |
| `reels.service.ts` | `like()` | 674 | YES |
| `reels.service.ts` | `likeComment()` | 830 | YES |
| `videos.service.ts` | `like()` | 543 | **NO** |
| `videos.service.ts` | `dislike()` | 605 | **NO** |
| `videos.service.ts` | `likeComment()` | 804 | **NO** |
| `channel-posts.service.ts` | `like()` | 125 | **NO** |

**Impact:** Video creators can like their own videos and comments, inflating engagement metrics. Channel post authors can like their own community posts.

---

### [HIGH] A12-4 — Comment reply nesting depth unbounded across all content types

All 4 content types allow `parentId` for reply nesting (posts, reels, videos, threads), but NONE enforce a maximum nesting depth.

**Affected methods:**
- `posts.service.ts` `addComment()` line 1348: validates parentId belongs to same post, but does NOT check if the parent is itself a reply (allowing reply-to-reply-to-reply-to-...)
- `reels.service.ts` `comment()` line 762: validates parentId belongs to same reel, no depth check
- `videos.service.ts` `comment()` line 681: validates parentId belongs to same video, no depth check
- `threads.service.ts` `addReply()` line 959: validates parentId belongs to same thread, no depth check

The Prisma schema models all use self-referential relations (`Comment.parentId -> Comment.id`) with no constraint on nesting level.

**Impact:** An attacker can create a chain of 1000+ nested replies, which when fetched recursively could cause:
1. O(n) recursive queries or very deep JOIN trees
2. Stack overflows if client-side rendering recurses through the nesting
3. UI rendering performance degradation on mobile

**Fix:** Add a depth check. When `parentId` is provided, query the parent and if its own `parentId` is non-null, flatten the reply to point to the root comment (or cap at depth=2).

---

### [HIGH] A12-5 — Counter desync: parent comment deletion does not cascade to replies' counter contribution

**File:** `posts.service.ts`, `deleteComment()`, line 1475

When a parent comment is deleted (soft-removed), only -1 is subtracted from `commentsCount` (line 1489). But the parent's replies each contributed +1 to `commentsCount` when created (line 1396), and they are NOT marked as removed. The replies remain visible (fetchable via `getCommentReplies`) and their counter contributions remain.

**Example:** Post has 1 top-level comment with 5 replies. `commentsCount = 6`. Delete the parent comment. `commentsCount = 5`. But only the parent is soft-deleted; the 5 replies are still in the DB and still fetchable. The real visible comment count is 5 orphaned replies, but `commentsCount` says 5 (coincidence). If those replies are individually deleted later, counter goes to 0, but the 5 replies were already inaccessible (their parent is removed). This leads to ghost counts.

**Same issue in:**
- `reels.service.ts` `deleteComment()` line 806: decrements by 1 only
- `videos.service.ts` `deleteComment()` line 784: decrements by 1 only
- `threads.service.ts` `deleteReply()` line 992: decrements `repliesCount` by 1 only

---

### [HIGH] A12-6 — Reel unlikeComment decrements counter even when no like exists (deleteMany silent success)

**File:** `reels.service.ts`, `unlikeComment()`, line 854

```typescript
await this.prisma.$transaction([
  this.prisma.reelCommentReaction.deleteMany({
    where: { commentId, userId },
  }),
  this.prisma.$executeRaw`UPDATE "reel_comments" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${commentId}`,
]);
```

`deleteMany` returns `{ count: 0 }` when no matching record exists -- it does NOT throw. The transaction succeeds regardless, and the `likesCount` is decremented unconditionally. If the user hasn't liked the comment, this still decrements.

**Comparison:** 
- `posts.service.ts` `unlikeComment()` line 1528: checks `existing` first, throws `NotFoundException` if not found
- `videos.service.ts` `unlikeComment()` line 846: checks `existing` first, throws `NotFoundException` if not found
- Reels: no pre-check, decrements blindly

**Impact:** Repeated calls to `DELETE /reels/:id/comments/:commentId/like` drive `likesCount` to 0 (GREATEST prevents negative), desynchronizing the counter from actual likes. An attacker can zero out any reel comment's like count.

---

### [MEDIUM] A12-7 — TOCTOU race condition on like creation without P2002 catch (threads, channel posts)

**Affected methods:**
| Service | Method | Line | P2002 catch |
|---------|--------|------|-------------|
| `posts.service.ts` | `react()` | 967 | YES |
| `posts.service.ts` | `likeComment()` | 1519 | YES |
| `reels.service.ts` | `like()` | 702 | YES |
| `reels.service.ts` | `likeComment()` | 845 | YES |
| `videos.service.ts` | `like()` | 595 | YES |
| `videos.service.ts` | `likeComment()` | 821 | YES |
| `threads.service.ts` | `like()` | 721 | YES |
| `threads.service.ts` | `likeReply()` | 888 | **NO** |
| `channel-posts.service.ts` | `like()` | 125 | **NO** |

All methods do a check-then-act pattern (find existing, then create). The unique constraint on the reaction table prevents actual duplicates, but without catching P2002, the concurrent duplicate request returns an unhandled Prisma error (500 Internal Server Error) instead of a clean 409 Conflict.

**Impact:** Under concurrent load, users see 500 errors when rapidly tapping like. The unique constraint prevents data corruption, but the UX is broken.

---

### [MEDIUM] A12-8 — Missing rate limiting on 8 mutation endpoints

**Endpoints without `@Throttle` or `@TargetThrottle`:**

| Controller | Endpoint | Method |
|------------|----------|--------|
| `posts.controller.ts` | `PATCH :id/comments/:commentId` | editComment (line 241) |
| `posts.controller.ts` | `DELETE :id/comments/:commentId` | deleteComment (line 253) |
| `posts.controller.ts` | `DELETE :id/react` | unreact (line 159) |
| `posts.controller.ts` | `DELETE :id/comments/:commentId/like` | unlikeComment (line 277) |
| `reels.controller.ts` | `DELETE :id/comments/:commentId/like` | unlikeComment (line 194) |
| `reels.controller.ts` | `DELETE :id/comments/:commentId` | deleteComment (line 205) |
| `videos.controller.ts` | `DELETE :id/reaction` | removeReaction (no throttle visible) |
| `threads.controller.ts` | `DELETE :id/replies/:replyId` | deleteReply (line 231) |

**Note:** The PostsController has no class-level `@Throttle`, so any endpoint without its own decorator is completely unthrottled. ChannelPostsController does have a class-level `@Throttle({ default: { limit: 30, ttl: 60000 } })` at line 11, so its endpoints are covered.

**Impact:** An attacker can spam edit/delete mutations at unlimited rate. Delete operations can cause rapid counter decrements.

---

### [MEDIUM] A12-9 — Empty string comments allowed across all content types

All comment/reply DTOs allow empty string content:

| DTO | File | Validators |
|-----|------|-----------|
| `AddCommentDto` | `posts/dto/add-comment.dto.ts` | `@IsString() @MaxLength(1000)` — no `@IsNotEmpty()` |
| `EditCommentDto` | `posts/dto/edit-comment.dto.ts` | `@IsString() @MaxLength(1000)` — no `@IsNotEmpty()` |
| `CreateCommentDto` | `reels/dto/create-comment.dto.ts` | `@IsString() @MaxLength(500)` — no `@IsNotEmpty()` |
| `CreateVideoCommentDto` | `videos/dto/create-video-comment.dto.ts` | `@IsString() @MaxLength(2000)` — no `@IsNotEmpty()` |
| `AddReplyDto` | `threads/dto/add-reply.dto.ts` | `@IsString() @MaxLength(500)` — no `@IsNotEmpty()` |

`@IsString()` passes for `""` (empty string). `sanitizeText("")` returns `""` after trim. So a user can create comments with no visible content.

**Impact:** Spam with empty comments. Counter inflation with zero-content comments. Poor UX when users see blank comment bubbles.

---

### [MEDIUM] A12-10 — getCommentReplies does not filter blocked/muted users (posts, videos)

**Affected methods:**
- `posts.service.ts` `getCommentReplies()` line 1279: does NOT accept `viewerId`, does NOT call `getExcludedUserIds()`
- `videos.service.ts` `getCommentReplies()` line 1009: does NOT accept `viewerId`, does NOT call `getExcludedUserIds()`

**Comparison:**
- `posts.service.ts` `getComments()` line 1247: accepts `viewerId`, calls `getExcludedUserIds()`, filters blocked/muted users
- `reels.service.ts` `getComments()` line 868: accepts `userId`, calls `getExcludedUserIds()`, filters blocked/muted users
- `threads.service.ts` `getReplies()` line 846: accepts `viewerId`, calls `getExcludedUserIds()`, filters blocked/muted users

**Impact:** Even if user A blocks user B, user A will still see user B's replies nested under comments. The block filter only applies at the top-level comment layer.

---

### [MEDIUM] A12-11 — Reel "deleted" comments still visible in getComments (missing isRemoved filter)

**File:** `reels.service.ts`

`deleteComment()` at line 820 sets `content: '[deleted]'` but does NOT set `isRemoved: true` (the field exists on the model, line 1512 of schema).

`getComments()` at line 872 does NOT filter by `isRemoved: false`.

**Comparison:**
- Posts `getComments()` line 1251: filters `isRemoved: false` -- correct
- Posts `deleteComment()` line 1487: sets `isRemoved: true` -- correct
- Videos `getComments()` line 742: filters `isDeleted: false` -- correct
- Videos `deleteComment()` line 798: sets `isDeleted: true` -- correct
- Reels `getComments()`: no `isRemoved` filter -- broken
- Reels `deleteComment()`: only sets content to `[deleted]`, does not set `isRemoved: true` -- broken

**Impact:** "Deleted" reel comments show up as `[deleted]` in the comment feed with user attribution still visible. They are not truly hidden.

---

### [MEDIUM] A12-12 — Thread deleteReply does not allow thread owner to delete (inconsistent with posts/reels/videos)

**File:** `threads.service.ts`, `deleteReply()`, line 992

```typescript
if (reply.userId !== userId) throw new ForbiddenException();
```

Only the reply author can delete. The thread owner cannot delete replies on their own thread.

**Comparison:**
- `posts.service.ts` `deleteComment()` line 1482: allows comment author OR post owner
- `reels.service.ts` `deleteComment()` line 813-816: allows comment author OR reel owner
- `videos.service.ts` `deleteComment()` line 789-792: allows comment author OR video owner
- `threads.service.ts` `deleteReply()` line 995: only reply author

**Impact:** Thread authors have no way to moderate replies on their own threads (except hide/report if those exist). On all other content types, the content owner can delete offensive comments.

---

### [MEDIUM] A12-13 — Video getComments and getCommentReplies do not filter blocked/muted users

**File:** `videos.service.ts`

`getComments()` at line 737: does NOT accept a `viewerId` parameter, does NOT call `getExcludedUserIds()`.

`getCommentReplies()` at line 1009: does NOT accept a `viewerId` parameter, does NOT call `getExcludedUserIds()`.

Both filter by `user: { isBanned: false, isDeactivated: false, isDeleted: false }` (system-level bans) but NOT by the viewer's personal block/mute list.

**Impact:** A user sees comments from people they blocked on all videos.

---

### [LOW] A12-14 — Inconsistent soft-delete strategies across content types

| Content type | Delete method | What it does | Flag set | Content preserved |
|-------------|--------------|-------------|----------|------------------|
| Post comment | `deleteComment()` | Sets `isRemoved: true` | `isRemoved` | Content preserved for moderation |
| Reel comment | `deleteComment()` | Sets `content: '[deleted]'` | None | Content overwritten, lost forever |
| Video comment | `deleteComment()` | Sets `isDeleted: true` AND `content: '[deleted]'` | `isDeleted` | Content overwritten despite having a flag |
| Thread reply | `deleteReply()` | Sets `content: '[deleted]'` | None | Content overwritten, lost forever |

Post comments are the only ones that preserve content for moderation audit trail. Reel and thread deletions destroy evidence. Video deletion has the flag but also destroys the content.

---

### [LOW] A12-15 — Real-time like count in Redis publish uses stale value

**File:** `posts.service.ts`, `react()`, line 979

```typescript
data: { postId, userId, reaction, likesCount: (post.likesCount || 0) + (existing ? 0 : 1) },
```

The `post.likesCount` was read at line 900, before the transaction at line 947 that increments it. Under concurrent load, this published value can be stale (read post with 50 likes, 3 other likes land between read and publish, published value says 51 but actual DB value is 54). This is the value pushed to all connected clients via Redis pub/sub.

**Impact:** Cosmetic only (client will get correct count on next fetch), but the real-time update shows wrong count.

---

### [LOW] A12-16 — Post editComment and hideComment do not verify the comment belongs to the post in the URL

**File:** `posts.controller.ts`

`editComment()` at line 241 receives both `:id` (postId) and `:commentId` but the service method `editComment(commentId, userId, content)` at line 1451 does NOT verify `comment.postId === postId`. The postId from the URL is ignored.

Same for `hideComment()` at line 361: receives `_postId` (unused variable name proves it's ignored) and `commentId`, service at line 1677 does not check postId.

**Impact:** A user can edit/hide a comment by providing any arbitrary postId in the URL as long as they have the correct commentId. This is an information leak (confirms a commentId exists even if the attacker doesn't know which post it belongs to) and violates REST semantics where the resource path should be verified.

---

### [LOW] A12-17 — Reel comment getComments missing `parentId: null` filter for top-level only

**File:** `reels.service.ts`, `getComments()`, line 872

```typescript
where: {
  reelId,
  user: { isBanned: false, isDeactivated: false, isDeleted: false },
  ...(excludedUserIds.length ? { userId: { notIn: excludedUserIds } } : {}),
},
```

No `parentId: null` filter. This returns ALL comments including replies mixed in with top-level comments.

**Comparison:**
- `posts.service.ts` `getComments()` line 1251: `parentId: null` -- correct
- `videos.service.ts` `getComments()` line 741: `parentId: null` -- correct
- `reels.service.ts` `getComments()` line 872: no parentId filter -- **replies mixed with top-level**

**Impact:** Reel comment feeds show replies as if they were top-level comments, creating a confusing UI. Reply context is lost.

---

## Checklist Verification

### 1. BOLA -- Can user A delete user B's comment?
**PASS (mostly).** All deleteComment methods check `comment.userId !== userId` and throw `ForbiddenException`. Post/reel/video also allow the content owner to delete. Thread deleteReply only allows the reply author (A12-12 inconsistency, but not a BOLA).

### 2. Rate limit -- Comment spam? Like spam? No @Throttle?
**PARTIAL FAIL.** 8 mutation endpoints lack `@Throttle` (A12-8). Comment creation IS throttled (30/min on posts, reels, videos). Like creation IS throttled (via `@TargetThrottle` on posts, `@Throttle` on others). But edit, delete, unlike, and unreact are unthrottled.

### 3. Race conditions -- Like count increment/decrement atomic? Can double-like happen?
**PARTIAL FAIL.** Double-like prevented by unique constraints. Most services catch P2002 for clean error handling. But thread `likeReply()` and channel-post `like()` do NOT catch P2002 (A12-7). Reel `unlikeComment()` decrements counter even with no existing like (A12-6).

### 4. Cascade -- Comment delete cleans up replies, likes on the comment?
**FAIL.** Post comment deletion (soft-delete via `isRemoved: true`) does NOT cascade to replies or their counter contributions (A12-5). Replies become orphaned. The Prisma schema has `onDelete: Cascade` on the foreign key, but since soft-delete doesn't actually delete the row, the cascade never fires.

### 5. Nesting -- Are comment reply depths bounded?
**FAIL.** No nesting depth limit anywhere (A12-4). All content types allow unlimited reply-to-reply chains.

### 6. Blocked users -- Comments from blocked users visible to the blocker?
**PARTIAL FAIL.** Post top-level comments filter blocked/muted users. But post comment replies, ALL video comments, and reel comment lists (which also miss parentId filtering) do NOT filter blocked users (A12-1, A12-10, A12-13).

### 7. Content moderation -- Are comments moderated on create?
**PARTIAL FAIL.** Posts, videos, and threads moderate comment content. Reels do NOT (A12-2).

### 8. Counter sync -- Do likesCount/commentsCount stay in sync with actual records?
**FAIL.** Multiple desync vectors:
- Parent comment deletion subtracts 1 but orphans N replies' counter contributions (A12-5)
- Reel unlikeComment decrements without verifying a like exists (A12-6)
- No periodic reconciliation job to fix drift
