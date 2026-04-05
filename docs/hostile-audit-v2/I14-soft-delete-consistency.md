# I14: Soft-Delete Consistency Audit

**Scope:** All service files in `apps/api/src/modules/`. For every soft-deletable model (Post, Thread, Reel, Video, Comment, ReelComment, VideoComment, ThreadReply, Story, Message), find ALL queries that return content to users without filtering the soft-delete flag.

**Auditor:** Hostile code audit, 2026-04-05

---

## Soft-Delete Flags by Model

| Model | Flag(s) | Schema line(s) |
|-------|---------|---------------|
| Post | `isRemoved` | schema.prisma:1282 |
| Thread | `isRemoved` | schema.prisma:1573 |
| Reel | `isRemoved` | schema.prisma:1445 |
| Video | `isRemoved` | schema.prisma:1710 |
| Story | `isRemoved`, `isArchived` | schema.prisma:1359 |
| Comment (post) | `isRemoved`, `isHidden` | schema.prisma:1850-1851 |
| ReelComment | `isRemoved` | schema.prisma:1512 |
| ThreadReply | `isRemoved` | schema.prisma:1622 |
| VideoComment | `isDeleted` | schema.prisma:1761 |
| Message | `isDeleted` | schema.prisma:1999 |
| VideoReply | `isDeleted` | schema.prisma:3295 |

---

## Findings

### I14-01 [CRITICAL] Story feed query does NOT filter `isRemoved`

**File:** `stories.service.ts` line 82-88
**Query:** `getFollowingStories()` -- the primary story feed for all users.
```typescript
where: {
  userId: { in: ids },
  expiresAt: { gt: new Date() },
  isArchived: false,
  user: { isDeactivated: false, isBanned: false, isDeleted: false },
}
```
**Missing:** `isRemoved: false`

**Impact:** A story that has been soft-deleted by moderation (`isRemoved: true` via `reports.service.ts` line 199) will still appear in every follower's story feed. The story tray at the top of the app will show content that moderators explicitly removed.

---

### I14-02 [CRITICAL] Story `getById` does NOT check `isRemoved`

**File:** `stories.service.ts` line 270-273
```typescript
const story = await this.prisma.story.findUnique({
  where: { id: storyId },
});
if (!story) throw new NotFoundException('Story not found');
```
**Missing:** No `isRemoved` check after fetch.

**Impact:** Direct URL access to a moderation-removed story returns the full story content. Anyone with the story ID can view removed content.

**Note:** The method checks `isArchived` and `expiresAt` for non-owners, but never checks `isRemoved`. This is the public-facing `getById` endpoint.

---

### I14-03 [CRITICAL] Story `markViewed`, `reactToStory`, `replyToStory`, `submitStickerResponse`, `getViewers`, `getReactionSummary`, `getStickerResponses`, `getStickerSummary` all operate on removed stories

**File:** `stories.service.ts`, multiple methods.

Each of these methods fetches the story by `findUnique({ where: { id: storyId } })` without checking `isRemoved`:

| Method | Line | What it allows on removed stories |
|--------|------|----------------------------------|
| `markViewed` | 345 | Records a view, increments `viewsCount` |
| `reactToStory` | 582 | Creates emoji reaction |
| `replyToStory` | 413 | Creates a reply message in DM |
| `submitStickerResponse` | 675 | Records poll/quiz/emoji response |
| `getViewers` | 378 | Returns viewer list to owner |
| `getReactionSummary` | 517 | Returns emoji reaction counts |
| `getStickerResponses` | 711 | Returns sticker response data |
| `getStickerSummary` | 722 | Returns aggregated sticker results |

**Impact:** Users can interact with (view, react, reply to, vote on) stories that moderators have removed. View counts continue accumulating. Sticker poll results continue being recorded.

---

### I14-04 [CRITICAL] Story `getArchived` does NOT filter `isRemoved`

**File:** `stories.service.ts` line 662-671
```typescript
where: {
  userId,
  isArchived: true,
}
```
**Missing:** `isRemoved: false`

**Impact:** Owner's archive view shows moderation-removed stories alongside legitimately archived ones. The user could add these removed stories to a highlight album, effectively republishing moderation-removed content.

---

### I14-05 [HIGH] Reel comment `getComments` does NOT filter `isRemoved` on ReelComment

**File:** `reels.service.ts` line 872-877
```typescript
where: {
  reelId,
  user: { isBanned: false, isDeactivated: false, isDeleted: false },
  ...(excludedUserIds.length ? { userId: { notIn: excludedUserIds } } : {}),
}
```
**Missing:** `isRemoved: false` on the ReelComment.

**Schema confirms:** ReelComment has `isRemoved Boolean @default(false)` (schema line 1512).

**Impact:** Reel comments that were soft-deleted by moderation (`reports.service.ts` sets `isRemoved: true` on comments) still appear in the comment section. The content-replacement pattern (`content: '[deleted]'`) at line 820 only fires for user-initiated deletes, not moderation-initiated ones which only set `isRemoved: true`.

**Note:** The reel comment delete at line 820 does `content: '[deleted]'` but does NOT set `isRemoved: true`. So there are actually two inconsistent deletion mechanisms: content replacement (user delete) and `isRemoved` flag (moderation). The `getComments` query filters by neither.

---

### I14-06 [HIGH] Reel comment like/unlike operations do NOT check `isRemoved` on the comment

**File:** `reels.service.ts`
- `likeComment` (line 830+): `findUnique({ where: { id: commentId } })` -- no `isRemoved` check.
- `unlikeComment` (line 850+): `findUnique` -- no `isRemoved` check.

**Impact:** Users can like/unlike moderation-removed reel comments, incrementing/decrementing counters on deleted content.

---

### I14-07 [HIGH] Post comment `likeComment` and `unlikeComment` do NOT check `isRemoved` or `isHidden`

**File:** `posts.service.ts`
- `likeComment` line 1495: `findUnique({ where: { id: commentId } })` -- no `isRemoved`/`isHidden` check.
- `unlikeComment` line ~1525: same pattern.

**Impact:** Users can like comments that have been hidden by the post author or removed by moderation.

---

### I14-08 [HIGH] Post `report` does NOT check `isRemoved`

**File:** `posts.service.ts` line 1543-1544
```typescript
const post = await this.prisma.post.findUnique({ where: { id: postId } });
if (!post) throw new NotFoundException('Post not found');
```
**Missing:** No `isRemoved` check. A user can submit a report on an already-removed post. While not directly harmful, it means moderation queues accumulate reports on already-handled content.

---

### I14-09 [HIGH] Post `getPostAnalytics` does NOT check `isRemoved` on the target post

**File:** `posts.service.ts` line 1926
```typescript
const post = await this.prisma.post.findUnique({ where: { id: postId } });
```
**Missing:** No `isRemoved` check. The recent posts query at line 1931 correctly filters `isRemoved: false`, but the target post itself could be removed. An author could view analytics on their moderation-removed post.

---

### I14-10 [HIGH] Post `getRepurposeSuggestions` does NOT check `isRemoved`

**File:** `posts.service.ts` line 2104
```typescript
const post = await this.prisma.post.findUnique({ where: { id: postId } });
```
**Missing:** No `isRemoved` check. Returns repurpose suggestions for removed content.

---

### I14-11 [HIGH] Post `pinPost` does NOT check `isRemoved`

**File:** `posts.service.ts` line 1809
```typescript
const post = await this.prisma.post.findUnique({ where: { id: postId } });
```
**Missing:** No `isRemoved` check. A user could pin a moderation-removed post to their profile.

---

### I14-12 [HIGH] Post `pinComment` and `unpinComment` do NOT check comment `isRemoved`

**File:** `posts.service.ts` lines 1642-1645, 1664
```typescript
const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
if (!comment || comment.postId !== postId) throw new NotFoundException('Comment not found');
```
**Missing:** No `isRemoved` or `isHidden` check. A post owner could pin a moderation-removed or hidden comment, making it the most prominent comment on the post.

---

### I14-13 [HIGH] Post `hideComment` and `unhideComment` do NOT check `isRemoved`

**File:** `posts.service.ts` lines 1678, 1688
```typescript
const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
```
**Missing:** No `isRemoved` check. Could unhide a moderation-removed comment (setting `isHidden: false` on a comment that has `isRemoved: true`), which would cause it to reappear in feeds if `getComments` only filters by one flag.

---

### I14-14 [HIGH] Video `update` does NOT check `isRemoved`

**File:** `videos.service.ts` line 427-431
```typescript
const video = await this.prisma.video.findUnique({ where: { id: videoId } });
if (!video) throw new NotFoundException('Video not found');
if (video.userId !== userId) throw new ForbiddenException();
```
**Missing:** No `isRemoved` check. Author can edit title/description/thumbnail of a moderation-removed video.

---

### I14-15 [HIGH] Video `report` does NOT check `isRemoved`

**File:** `videos.service.ts` line 947
```typescript
const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
```
**Missing:** No `isRemoved` check (same issue as I14-08 for posts).

---

### I14-16 [HIGH] Video `getShareLink` and `getRecommended` do NOT check `isRemoved` on the source video

**File:** `videos.service.ts`
- `getShareLink` line 1050-1054: `findUnique` without `isRemoved`.
- `getRecommended` line 977-981: fetches source video tags without checking `isRemoved` (the result set correctly filters `isRemoved: false`, but the source lookup does not).

---

### I14-17 [HIGH] Video `createPremiere`, `startPremiere`, `setEndScreens` do NOT check `isRemoved`

**File:** `videos.service.ts`
- `createPremiere` line 1062: `findFirst({ where: { id: videoId, userId } })` -- no `isRemoved` check. Premiere can be created on a removed video.
- `startPremiere` line 1131: same pattern. A premiere can go live on a removed video.
- `setEndScreens` line 1165: same. End screens can be configured on removed videos.

**Impact:** A moderation-removed video could be scheduled for a premiere, with the premiere then going live and being visible to viewers.

---

### I14-18 [HIGH] VideoComment `likeComment` does NOT check `isDeleted`

**File:** `videos.service.ts` line 805-809
```typescript
const comment = await this.prisma.videoComment.findUnique({
  where: { id: commentId },
  select: { id: true, videoId: true, userId: true },
});
```
**Missing:** No `isDeleted` check. Users can like soft-deleted video comments.

---

### I14-19 [HIGH] Thread `getReplies` does NOT filter `isRemoved` on ThreadReply

**File:** `threads.service.ts` line 849-853
```typescript
const whereClause: Prisma.ThreadReplyWhereInput = {
  threadId,
  parentId: null,
  user: { isBanned: false, isDeactivated: false, isDeleted: false },
};
```
**Missing:** `isRemoved: false` on ThreadReply. Schema confirms ThreadReply has `isRemoved Boolean @default(false)` at line 1622.

**Impact:** Moderation-removed thread replies appear in the reply section.

---

### I14-20 [HIGH] Thread reply `likeReply`/`unlikeReply` do NOT check `isRemoved`

**File:** `threads.service.ts` line 889
```typescript
const reply = await this.prisma.threadReply.findUnique({ where: { id: replyId } });
```
**Missing:** No `isRemoved` check. Users can like/unlike removed replies.

---

### I14-21 [MEDIUM] Message `forwardMessage` does NOT check `isDeleted` on the original message

**File:** `messages.service.ts` line 1109-1117
```typescript
const original = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: { conversationId: true, content: true, ... },
});
if (!original) throw new NotFoundException('Message not found');
```
**Missing:** No `isDeleted` check. A deleted message (content already nulled at line 577) can be forwarded. In practice, the forwarded message would have `content: null`, but the forward itself should be rejected.

---

### I14-22 [MEDIUM] Message `starMessage` does NOT check `isDeleted`

**File:** `messages.service.ts` line 1337-1341
```typescript
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: { id: true },
});
if (!message) throw new NotFoundException('Message not found');
```
**Missing:** No `isDeleted` check. Users can star deleted messages.

---

### I14-23 [MEDIUM] Message `markDelivered` does NOT check `isDeleted`

**File:** `messages.service.ts` line 1206-1211
```typescript
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: { id: true, conversationId: true, deliveredAt: true },
});
```
**Missing:** No `isDeleted` check. Delivery receipts recorded on deleted messages.

---

### I14-24 [MEDIUM] Message slow-mode query includes deleted messages in recency check

**File:** `messages.service.ts` line 403-406
```typescript
const lastMsg = await this.prisma.message.findFirst({
  where: { conversationId, senderId },
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true },
});
```
**Missing:** `isDeleted: false`. A user's deleted messages count toward their slow-mode cooldown timer. This could cause a user to be throttled by a message they deleted.

---

### I14-25 [MEDIUM] Reel `publishTrial`, `archive`, `unarchive` do NOT check `isRemoved`

**File:** `reels.service.ts`
- `publishTrial` line 643: `findUnique({ where: { id: reelId } })` -- no `isRemoved`.
- `archive` line 1250: same.
- `unarchive` line 1262: same.

**Impact:** A moderation-removed reel can be published from trial, archived, or unarchived.

---

### I14-26 [MEDIUM] Reel `deleteDraft` allows deleting a reel that is `isRemoved: true`

**File:** `reels.service.ts` line 1347-1352
```typescript
const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
```
Uses `prisma.reel.delete()` (hard delete) on a soft-deleted reel. While deleting already-removed content isn't harmful to users, it destroys the moderation audit trail.

---

### I14-27 [MEDIUM] Post comment `parentId` validation does NOT check parent's `isRemoved`

**File:** `posts.service.ts` line 1349-1355
```typescript
const parent = await this.prisma.comment.findUnique({
  where: { id: dto.parentId },
  select: { postId: true },
});
if (!parent || parent.postId !== postId) throw new BadRequestException('...');
```
**Missing:** No `isRemoved` check on the parent comment. A reply can be created as a child of a moderation-removed comment.

---

### I14-28 [MEDIUM] Post `delete` does NOT check if already removed

**File:** `posts.service.ts` line 862-863
```typescript
const post = await this.prisma.post.findUnique({ where: { id: postId } });
```
A user can "delete" an already-removed post, overwriting the `removedById` field (line 870) from the moderator's ID to the user's ID, and updating `removedAt` to a later timestamp. This corrupts the moderation audit trail.

---

### I14-29 [LOW] Inconsistent soft-delete mechanism: 3 different patterns

The codebase uses three different soft-delete mechanisms inconsistently:

| Pattern | Models | Example |
|---------|--------|---------|
| `isRemoved: true` (flag only) | Post, Thread, Reel, Video, Story, Comment, ThreadReply | Most models |
| `isDeleted: true` + content nulling | Message | `messages.service.ts` line 576 |
| `content: '[deleted]'` + NO `isRemoved` flag | ReelComment (user delete) | `reels.service.ts` line 820 |
| `isDeleted: true` + `content: '[deleted]'` | VideoComment | `videos.service.ts` line 798 |

The reel comment user-delete at line 820 does NOT set `isRemoved: true`, only replaces content. But moderation via `reports.service.ts` sets `isRemoved: true` without replacing content. The `getComments` query filters by neither flag, so moderation-removed comments with their original content are visible.

---

### I14-30 [LOW] ReelComment moderation removal inconsistent with user deletion

**File:** `reports.service.ts` line 199 vs `reels.service.ts` line 820

Moderation:
```typescript
data: { isRemoved: true }
// Content preserved for audit trail, but displayed to users because getComments doesn't filter isRemoved
```

User delete:
```typescript
data: { content: '[deleted]' }
// isRemoved NOT set, but content replaced so it "looks" deleted
```

These two mechanisms don't compose. If moderator sets `isRemoved: true` and then user "deletes" (sets content to `[deleted]`), the comment has `isRemoved: true, content: '[deleted]'`. But neither the feed query nor the delete query checks the other flag.

---

## Summary Table

| ID | Severity | Model | Method | Missing Filter |
|----|----------|-------|--------|----------------|
| I14-01 | CRITICAL | Story | `getFollowingStories` | `isRemoved: false` |
| I14-02 | CRITICAL | Story | `getById` | `isRemoved` check |
| I14-03 | CRITICAL | Story | 8 interaction methods | `isRemoved` check |
| I14-04 | CRITICAL | Story | `getArchived` | `isRemoved: false` |
| I14-05 | HIGH | ReelComment | `getComments` | `isRemoved: false` |
| I14-06 | HIGH | ReelComment | `likeComment`/`unlikeComment` | `isRemoved` check |
| I14-07 | HIGH | Comment | `likeComment`/`unlikeComment` | `isRemoved`/`isHidden` |
| I14-08 | HIGH | Post | `report` | `isRemoved` check |
| I14-09 | HIGH | Post | `getPostAnalytics` | `isRemoved` check |
| I14-10 | HIGH | Post | `getRepurposeSuggestions` | `isRemoved` check |
| I14-11 | HIGH | Post | `pinPost` | `isRemoved` check |
| I14-12 | HIGH | Comment | `pinComment`/`unpinComment` | `isRemoved`/`isHidden` |
| I14-13 | HIGH | Comment | `hideComment`/`unhideComment` | `isRemoved` check |
| I14-14 | HIGH | Video | `update` | `isRemoved` check |
| I14-15 | HIGH | Video | `report` | `isRemoved` check |
| I14-16 | HIGH | Video | `getShareLink`/`getRecommended` | `isRemoved` check |
| I14-17 | HIGH | Video | `createPremiere`/`startPremiere`/`setEndScreens` | `isRemoved` check |
| I14-18 | HIGH | VideoComment | `likeComment` | `isDeleted` check |
| I14-19 | HIGH | ThreadReply | `getReplies` | `isRemoved: false` |
| I14-20 | HIGH | ThreadReply | `likeReply`/`unlikeReply` | `isRemoved` check |
| I14-21 | MEDIUM | Message | `forwardMessage` | `isDeleted` check |
| I14-22 | MEDIUM | Message | `starMessage` | `isDeleted` check |
| I14-23 | MEDIUM | Message | `markDelivered` | `isDeleted` check |
| I14-24 | MEDIUM | Message | slow-mode recency check | `isDeleted: false` |
| I14-25 | MEDIUM | Reel | `publishTrial`/`archive`/`unarchive` | `isRemoved` check |
| I14-26 | MEDIUM | Reel | `deleteDraft` | `isRemoved` check |
| I14-27 | MEDIUM | Comment | parent validation | `isRemoved` check |
| I14-28 | MEDIUM | Post | `delete` overwrites moderation | `isRemoved` pre-check |
| I14-29 | LOW | Multiple | 3 inconsistent patterns | N/A (design) |
| I14-30 | LOW | ReelComment | moderation vs user delete | N/A (design) |

**Counts:** 4 CRITICAL, 16 HIGH, 8 MEDIUM, 2 LOW = 30 findings total.

---

## Models with GOOD Coverage (for completeness)

These areas were checked and found to correctly filter soft-delete flags:

- **Post feed queries** (`getForYou`, `getFollowing`, `getTrending`, `getUserPosts`): all include `isRemoved: false` + user ban checks.
- **Thread feed queries** (`getForYou`, `getFollowing`, `getUserThreads`): all include `isRemoved: false`.
- **Reel feed queries** (`getForYou`, `getFollowing`, `getUserReels`, `getByAudioTrack`): all include `isRemoved: false`.
- **Video feed queries** (`getChannelVideos`, `getById`, `like`, `save`, `comment`): all include `isRemoved: false` or check status + isRemoved.
- **Search service**: all typed searches filter `isRemoved: false` in Prisma and check `isRemoved` in Meilisearch post-filter.
- **Feed service** (personalized): all queries filter `isRemoved: false`.
- **Bookmarks service**: all queries include `{ post: { isRemoved: false } }` etc.
- **OG service** (link previews): filters `isRemoved: false`.
- **Message `getMessages`**: filters `isDeleted: false`.
- **Message `searchMessages`**: filters `isDeleted: false`.
- **Message `getMediaGallery`**: filters `isDeleted: false`.
- **Message `getPinnedMessages`**: filters `isDeleted: false`.
- **Counter reconciliation**: all raw SQL includes `"isRemoved" = false`.
- **Meilisearch sync service**: all batch syncs filter `isRemoved: false`.
