# Audit Agent #5 — Content Creation Services

**Scope:** posts, threads, stories, reels, channels, videos, polls
**Files audited:** 40+ files (services, controllers, DTOs, modules)
**Date:** 2026-03-21
**Total findings:** 94

---

## Legend

| Severity | Meaning |
|----------|---------|
| **P0** | Ship blocker / data corruption / security hole |
| **P1** | Significant bug affecting core functionality |
| **P2** | Moderate — UX impact, data integrity risk, missing validation |
| **P3** | Minor — code quality, missing feature, cosmetic |

---

## Finding Summary

| # | Severity | Category | File | Line(s) | Description |
|---|----------|----------|------|---------|-------------|
| 1 | P0 | Moderation | reels.service.ts | 160-161 | Reel content moderation references `reel.description` but field is `caption` — moderation NEVER fires |
| 2 | P0 | Moderation | reels.service.ts | 176 | Search index uses `reel.description` — always `undefined`, all reels indexed with empty description |
| 3 | P0 | Delete consistency | videos.service.ts | 350-353 | Video delete uses HARD delete (`prisma.video.delete`) while all other content types use soft delete (`isRemoved: true`) |
| 4 | P0 | Delete consistency | channels.service.ts | 162 | Channel delete uses HARD delete with cascade — destroys all videos, subscriptions, comments permanently and irrecoverably |
| 5 | P0 | Auth bypass | stories.controller.ts | 59-63 | `getById` has NO auth guard at all — any expired, archived, or closeFriendsOnly story is publicly accessible by ID |
| 6 | P0 | Privacy | stories.service.ts | 59-67 | Story feed does NOT filter `closeFriendsOnly` stories — users see close-friends-only stories of people they follow even if not in their close friends list |
| 7 | P0 | Privacy | stories.service.ts | 59-67 | Story feed does NOT filter `subscribersOnly` stories — non-subscribers can see subscriber-only stories |
| 8 | P0 | View inflation | videos.service.ts | 614-636 | Video view count is infinitely inflatable — no deduplication, every call to `/view` increments `viewsCount` unconditionally |
| 9 | P0 | Inline type | posts.controller.ts | 26-49 | Four inline DTO classes (ReactDto, EditCommentDto, ShareDto, UpdatePostDto) defined directly in controller — bypass validation pipeline if ValidationPipe is not global |
| 10 | P1 | Malformed query | stories.service.ts | 438-444 | `getStickerResponses` has broken Prisma query — `take: 50` is nested inside the `...(stickerType ? { stickerType } : { take: 50 })` conditional, meaning when stickerType is provided, no limit is applied, and when absent, `take: 50` is inside the where clause, not a findMany option |
| 11 | P1 | Counter integrity | posts.service.ts | 443-452 | Hashtag counters increment inside transaction but are NOT decremented on post deletion — hashtag postsCount grows monotonically, never accurate |
| 12 | P1 | Counter integrity | threads.service.ts | 332-341 | Same issue for threads: hashtag `threadsCount` incremented on create but never decremented on delete |
| 13 | P1 | Counter integrity | reels.service.ts | 80-90 | Reel creation increments `hashtag.postsCount` instead of a reel-specific counter — conflates post and reel hashtag counts |
| 14 | P1 | Feed quality | posts.service.ts | 137 | ForYou feed cursor pagination is broken — after scoring and sorting by engagement, it uses `findIndex` with createdAt ISO comparison, but scored posts are no longer in createdAt order, causing duplicate or skipped posts |
| 15 | P1 | Feed quality | threads.service.ts | 175 | Same broken cursor pagination in ForYou thread feed — scored items re-sorted by engagement but cursor searches by createdAt |
| 16 | P1 | Feed quality | reels.service.ts | 237 | Same broken cursor pagination in reel feed |
| 17 | P1 | Missing filter | posts.service.ts | 76-218 | Feed does NOT filter dismissed posts (FeedDismissal records) — dismiss endpoint works but is never consulted during feed generation |
| 18 | P1 | Missing filter | threads.service.ts | 125-231 | Thread feed does NOT filter dismissed threads — same as posts |
| 19 | P1 | Missing filter | posts.service.ts | 76-218 | Feed does NOT filter scheduled posts for all feed types except 'following' — forYou and trending feeds lack `scheduledAt: null` |
| 20 | P1 | Auth gap | stories.controller.ts | 110-112 | Story reply content comes from `@Body('content')` — inline extraction with no DTO validation, no @MaxLength, no sanitization at controller level |
| 21 | P1 | Auth gap | stories.controller.ts | 176 | Sticker response body uses inline type `{ stickerType: string; responseData: Record<string, unknown> }` — no DTO validation, arbitrary JSON accepted |
| 22 | P1 | Auth gap | threads.controller.ts | 250 | `setReplyPermission` uses `@Body('permission')` — inline extraction with no DTO, no validation pipe enforcement; any string accepted |
| 23 | P1 | Post owner auth | posts.service.ts | 878-891 | `deleteComment` only checks if the comment was authored by userId — does NOT allow the post owner to delete comments on their own post (unlike reels.service which correctly allows both) |
| 24 | P1 | Missing visibility | posts.service.ts | 351-360 | Chronological feed does not filter by `visibility` — includes CIRCLE and FOLLOWERS-only posts from followed users regardless of viewer's circle membership |
| 25 | P1 | Missing visibility | posts.service.ts | 393-401 | Favorites feed does not filter by `visibility` — same issue |
| 26 | P1 | Stale cache | reels.service.ts | 186-191 | Reel feed caches for 30 seconds but cache is never invalidated when user creates, likes, or bookmarks a reel — stale personalization data returned |
| 27 | P1 | Stale cache | videos.service.ts | 172-177 | Same caching issue for video feed |
| 28 | P1 | Block bypass | posts.service.ts | 549-576 | `getById` does NOT check if viewer is blocked by the post author — blocked users can view any specific post by ID |
| 29 | P1 | Block bypass | reels.service.ts | 346-370 | `getById` does NOT check block status — blocked users can view any reel by ID |
| 30 | P1 | Block bypass | videos.service.ts | 270-307 | `getById` does NOT check block status — blocked users can view any video by ID |
| 31 | P1 | Block bypass | stories.service.ts | 172-178 | `getById` does NOT check block status AND has no auth — anyone can view any story |
| 32 | P1 | Missing enforcement | threads.service.ts | 679-707 | `addReply` does NOT check `replyPermission` before creating the reply — the `canReply` endpoint exists but is informational only, never enforced server-side |
| 33 | P1 | Counter integrity | polls.service.ts | 158-201 | `retractVote` uses `decrement: 1` instead of `GREATEST(x - 1, 0)` — can produce negative votesCount and totalVotes if concurrent requests hit |
| 34 | P1 | Cross-post auth | posts.service.ts | 1100-1130 | `crossPost` does not increment `postsCount` on the user for the new posts — user stats become inaccurate |
| 35 | P1 | Counter integrity | posts.service.ts | 1111-1128 | `crossPost` creates posts without incrementing hashtag counters even though it copies hashtags from original |
| 36 | P2 | Follow cap | posts.service.ts | 164-166 | Follows query capped at `take: 50` — users following > 50 people see an incomplete feed missing content from follows 51+ |
| 37 | P2 | Follow cap | threads.service.ts | 108-116 | Same `take: 50` cap on blocks, mutes queries — users with > 50 blocks/mutes will still see content from un-excluded users |
| 38 | P2 | Enrichment cap | posts.service.ts | 417-426 | `enrichPostsForUser` queries reactions and saves with `take: 50` — if feed returns > 50 posts (trending fetches 200), enrichment data is incomplete |
| 39 | P2 | Missing auth | stories.controller.ts | 45-48 | `getHighlights` has NO auth guard — exposes any user's highlight albums publicly even for private accounts |
| 40 | P2 | Missing auth | reels.controller.ts | 230-236 | `getShareLink` has `OptionalClerkAuthGuard` but the service method (`getShareLink`) doesn't validate the reel exists — returns a URL for non-existent reels |
| 41 | P2 | No rate limit | stories.controller.ts | 83-101 | `markViewed` has no rate limit — can be called in a loop to inflate viewsCount (though deduped per user, scraping all viewers is possible) |
| 42 | P2 | No rate limit | reels.controller.ts | 163-173 | `view` endpoint has no rate limit |
| 43 | P2 | No rate limit | videos.controller.ts | 177-190 | `view` endpoint has no rate limit — and viewsCount is NOT deduped (see P0 #8) |
| 44 | P2 | Missing moderation | threads.service.ts | 329-413 | Thread creation moderates text content but does NOT moderate images in `mediaUrls` — unlike posts and reels which have image moderation |
| 45 | P2 | Missing moderation | videos.service.ts | 109-169 | Video creation does NOT moderate description text or thumbnail image — no moderation hook at all |
| 46 | P2 | Missing moderation | channels.service.ts | 63-94 | Channel creation does NOT moderate channel name or description |
| 47 | P2 | Missing report link | threads.service.ts | 792-808 | Thread report stores `description: 'thread:${threadId}'` in a generic string field instead of using a threadId FK — impossible to query reports by thread without string parsing |
| 48 | P2 | Missing report link | reels.service.ts | 728-741 | Same issue: reel report stored as string `'reel:${reelId}'` without proper FK |
| 49 | P2 | Missing report link | videos.service.ts | 647-666 | Same issue: video report stored as string `'video:${videoId}'` without proper FK |
| 50 | P2 | Duplicate report | posts.service.ts | 937-953 | Post report has no check for duplicate reports — same user can report the same post multiple times |
| 51 | P2 | Duplicate report | threads.service.ts | 792-808 | Same — no duplicate report check for threads |
| 52 | P2 | Duplicate report | reels.service.ts | 728-741 | Same — no duplicate report check for reels |
| 53 | P2 | Duplicate report | videos.service.ts | 647-666 | Same — no duplicate report check for videos |
| 54 | P2 | Self-react | posts.service.ts | 614-661 | Users can react to their own posts — no self-reaction guard (debatable UX, but inconsistent: threads.repost prevents self-repost) |
| 55 | P2 | Self-comment like | posts.service.ts | 893-919 | Users can like their own comments — no self-like guard |
| 56 | P2 | Missing sanitization | stories.service.ts | 258-337 | Story reply content is NOT sanitized with `sanitizeText()` before storing in message |
| 57 | P2 | Missing sanitization | stories.service.ts | 425-433 | Sticker response data is stored as-is without any sanitization — arbitrary JSON injected into DB |
| 58 | P2 | Private account leak | stories.service.ts | 51-108 | Story feed fetches all followed users' stories but does NOT check if those users' accounts are still public/accessible — if user A follows user B, then B goes private, A still sees B's stories |
| 59 | P2 | Story delete != delete | stories.service.ts | 181-191 | `delete` method sets `isArchived: true` but response says `{ deleted: true }` — semantically misleading, story is archived not deleted |
| 60 | P2 | Story not expired check | stories.service.ts | 205-224 | `markViewed` does not check if story has expired — can mark expired stories as viewed |
| 61 | P2 | Story reply no sanitize | stories.service.ts | 302-308 | Story reply message content is not sanitized — XSS risk if rendered in chat |
| 62 | P2 | Missing update endpoint | reels.service.ts | N/A | Reels have no update/edit endpoint — once created, caption cannot be changed (unlike posts, threads, videos which all have update) |
| 63 | P2 | Thread edit missing | threads.service.ts | N/A | Threads have no edit/update method — content cannot be corrected after posting |
| 64 | P2 | Video comment delete | videos.service.ts | N/A | Video comments have no delete endpoint exposed — `VideoComment` can be created but never deleted by the user |
| 65 | P2 | Video comment like | videos.service.ts | N/A | Video comment likes (`likesCount` field exists) but no like/unlike endpoint — dead field |
| 66 | P2 | Channel hard delete | channels.service.ts | 152-167 | Channel `delete` is a hard delete that cascades and destroys all videos, comments, subscriptions — should be soft delete for recovery |
| 67 | P2 | Poll voter privacy | polls.service.ts | 203-254 | `getVoters` endpoint has no authorization — any authenticated user can see who voted for what option, even on other users' polls (privacy concern) |
| 68 | P2 | Missing poll permissions | polls.controller.ts | 75-89 | Poll voters endpoint uses `OptionalClerkAuthGuard` — even unauthenticated users can see voter identities |
| 69 | P2 | Thread hard delete | threads.service.ts | 714-718 | `deleteReply` uses hard delete (`prisma.threadReply.delete`) while thread itself uses soft delete — inconsistent, child replies of the hard-deleted reply are cascade-deleted |
| 70 | P2 | Reel comment hard delete | reels.service.ts | 516-521 | Reel comment delete uses hard delete — inconsistent with post comments (soft delete) |
| 71 | P2 | Missing notification | stories.service.ts | 110-151 | Story creation sends NO notification to followers — followers discover stories only when they open the feed |
| 72 | P2 | Missing view recording | stories.service.ts | 172-178 | `getById` does not record a view — stories accessed directly by URL don't count as views |
| 73 | P3 | Missing select | posts.service.ts | 26-58 | POST_SELECT includes `isRemoved: true` — removed posts expose the isRemoved flag to clients (information disclosure) |
| 74 | P3 | Inconsistent pagination | stories.service.ts | 230-237 | Story viewers pagination uses `viewerId: { gt: cursor }` instead of standard cursor-skip pattern used everywhere else — may produce inconsistent results with concurrent inserts |
| 75 | P3 | Missing error handling | reels.service.ts | 912-914 | `getShareLink` does NOT verify the reel exists before returning the URL — returns a link to a non-existent reel |
| 76 | P3 | Unused import | reels.service.ts | 11 | `ReportReason` imported from Prisma but used only as a type cast string — no enum validation |
| 77 | P3 | Inconsistent response | stories.service.ts | 181-191 | `delete` archives but returns `{ deleted: true }` |
| 78 | P3 | No edit tracking | posts.service.ts | 578-595 | Post update does not set an `editedAt` timestamp — users cannot tell if a post was edited |
| 79 | P3 | No edit tracking | posts.service.ts | 864-876 | Comment edit does not set an `editedAt` timestamp |
| 80 | P3 | Missing gamification | stories.service.ts | 110-151 | Story creation awards no XP and updates no streak — inconsistent with posts, threads, reels, videos which all award XP |
| 81 | P3 | Missing analytics | stories.service.ts | 110-151 | Story creation has no analytics tracking — inconsistent with posts which track `post_created` |
| 82 | P3 | Missing gamification | channels.service.ts | 63-94 | Channel creation awards no XP |
| 83 | P3 | Unused parameter | posts.controller.ts | 326-337 | `hideComment` passes `id` (post ID) from route but the service method `hideComment(commentId, userId)` does not use it — post ownership is checked inside the service via comment.post.userId, but the route path suggests post-level scoping |
| 84 | P3 | Thread reply no XP | threads.service.ts | 679-707 | Adding a thread reply awards no XP — inconsistent with post comments which award XP |
| 85 | P3 | Missing feed cache invalidation | posts.service.ts | 155-157 | ForYou feed cache only invalidated for the post author, not for users who might see the post — stale feeds for 30 seconds |
| 86 | P3 | No scheduled post filter | posts.service.ts | 228-241 | Trending fallback does not filter `scheduledAt: null` — scheduled (future) posts could appear in trending |
| 87 | P3 | Reel isRemoved not checked | reels.service.ts | 395-397 | `like` checks `status !== ReelStatus.READY` but does not check `isRemoved` — can like a soft-deleted reel |
| 88 | P3 | Reel isRemoved not checked | reels.service.ts | 431-433 | `unlike` same issue — does not check `isRemoved` |
| 89 | P3 | Reel isRemoved not checked | reels.service.ts | 461-463 | `comment` same issue |
| 90 | P3 | Reel isRemoved not checked | reels.service.ts | 572-574 | `share` same issue |
| 91 | P3 | Premiere no auth validation | videos.service.ts | 781-790 | `setPremiereReminder` does not check for duplicate reminders — P2002 will throw unhandled |
| 92 | P3 | Missing end screen validation | videos.service.ts | 822-838 | `setEndScreens` spreads untrusted user data directly into Prisma create (`...item`) — could inject unexpected fields |
| 93 | P3 | Video OrderBy conflict | videos.service.ts | 210-213 | Feed `orderBy` specifies both `publishedAt: 'desc'` and `viewsCount: 'desc'` as object keys — Prisma treats this as ordering by publishedAt only (second key in object literals may be ignored) |
| 94 | P3 | Poll retract on expired | polls.service.ts | 158-201 | `retractVote` does not check if the poll has expired — users can retract votes after poll ends |

---

## Detailed Findings

### P0: Ship Blockers / Critical Bugs

#### [F01] Reel moderation references non-existent field `description` — moderation NEVER fires
- **File:** `apps/api/src/modules/reels/reels.service.ts`
- **Lines:** 160-161, 176
- **Category:** Content Moderation
- **Description:** After creating a reel, the service checks `reel.description` to trigger content moderation and search indexing. However, the Reel model has no `description` field — it uses `caption`. Since `reel.description` is always `undefined`, the `if (reel.description)` guard is always false. Text moderation NEVER fires for reels. Search indexing sends `description: undefined` for every reel.
- **Code:**
  ```typescript
  // Line 160-161
  if (reel.description) {
    this.queueService.addModerationJob({ content: reel.description, contentType: 'reel', contentId: reel.id });
  }
  // Line 176
  document: { id: reel.id, description: reel.description, userId, hashtags: reel.hashtags },
  ```
- **Fix:** Replace `reel.description` with `reel.caption` in both locations.

#### [F02] Video delete uses HARD delete, inconsistent with all other content types
- **File:** `apps/api/src/modules/videos/videos.service.ts`
- **Lines:** 350-353
- **Category:** Delete Consistency
- **Description:** Posts, threads, reels, and stories all use soft delete (`isRemoved: true` or `isArchived: true`). Videos use `prisma.video.delete()` which permanently destroys the record plus all comments, reactions, bookmarks via cascade. This means:
  1. No recovery possible
  2. Cascade deletes all related VideoComment, VideoReaction, VideoBookmark records
  3. If the video was referenced by end screens or premieres, those are also destroyed
  4. Video cannot be "undeleted" like posts can be "unarchived"
- **Code:**
  ```typescript
  this.prisma.video.delete({ where: { id: videoId } }),
  ```
- **Fix:** Change to soft delete: `this.prisma.video.update({ where: { id: videoId }, data: { status: 'REMOVED' } })` and filter `status !== 'REMOVED'` in all queries.

#### [F03] Channel delete uses HARD delete with cascade
- **File:** `apps/api/src/modules/channels/channels.service.ts`
- **Lines:** 162
- **Category:** Delete Consistency
- **Description:** `prisma.channel.delete()` permanently destroys the channel and ALL related data via cascade: all videos, subscriptions, video comments, video reactions, etc. This is an irreversible, destructive operation exposed behind a single auth check.
- **Fix:** Add a `isRemoved` field to Channel model, or at minimum require a confirmation step.

#### [F04] Story `getById` has NO auth guard — any story accessible publicly
- **File:** `apps/api/src/modules/stories/stories.controller.ts`
- **Lines:** 59-63
- **Category:** Auth / Privacy
- **Description:** The `getById` endpoint has neither `ClerkAuthGuard` nor `OptionalClerkAuthGuard`. Any anonymous user can access any story by ID, including:
  - Expired stories (past 24h)
  - Archived stories
  - Close-friends-only stories
  - Subscriber-only stories
  - Stories from private accounts
- **Code:**
  ```typescript
  @Get(':id')
  @ApiOperation({ summary: 'Get story by ID' })
  getById(@Param('id') id: string) {
    return this.storiesService.getById(id);
  }
  ```
- **Fix:** Add auth guard and check expiration, closeFriendsOnly, subscribersOnly, private account, and block status.

#### [F05-F06] Story feed does NOT filter closeFriendsOnly or subscribersOnly stories
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 59-67
- **Category:** Privacy
- **Description:** The `getFeedStories` query fetches all stories from followed users where `expiresAt > now()` and `isArchived: false`. There is NO filter for `closeFriendsOnly` or `subscribersOnly`. All followers see all stories regardless of these privacy flags.
- **Fix:** Add conditional filtering: check if viewer is in the author's close friends circle or is a subscriber before including those stories.

#### [F07] Video view count infinitely inflatable — no deduplication
- **File:** `apps/api/src/modules/videos/videos.service.ts`
- **Lines:** 614-636
- **Category:** Counter Integrity
- **Description:** The `view` method increments `viewsCount` unconditionally on every call. Unlike stories (which use `StoryView` deduplication) and reels (which use `ReelInteraction.viewed` deduplication), video views have no per-user deduplication check. A single user can inflate any video's view count by calling the endpoint in a loop.
- **Code:**
  ```typescript
  // "For simplicity, just increment" — this is the problem
  await this.prisma.video.update({
    where: { id: videoId },
    data: { viewsCount: { increment: 1 } },
  }),
  ```
- **Fix:** Add a deduplication check using `WatchHistory` — only increment if this is the first view today or first view ever.

#### [F08] Inline DTOs in posts controller bypass validation
- **File:** `apps/api/src/modules/posts/posts.controller.ts`
- **Lines:** 26-49
- **Category:** Validation
- **Description:** Four DTO classes (ReactDto, EditCommentDto, ShareDto, UpdatePostDto) are defined inline in the controller file rather than as separate DTO files. While they have class-validator decorators, if the global ValidationPipe is configured to only validate classes from the `dto/` directory or uses transform options, these inline classes may not be validated. Additionally:
  - `ReactDto.reaction` is typed as `string` with `@IsEnum(['LIKE', 'LOVE', 'SUPPORT', 'INSIGHTFUL'])` but the `ReactionType` Prisma enum may have different values
  - These bypass the standard DTO review process

---

### P1: Significant Bugs

#### [F09] Malformed Prisma query in `getStickerResponses`
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 438-444
- **Category:** Query Bug
- **Description:** The conditional spread produces a malformed query:
  ```typescript
  where: { storyId, ...(stickerType ? { stickerType } : {
    take: 50,
  }) },
  ```
  When `stickerType` is undefined, `take: 50` ends up INSIDE the `where` clause instead of as a `findMany` option. Prisma will either throw a runtime error or silently ignore the invalid where field, returning unlimited results.

#### [F10-F11] Hashtag counters never decremented
- **Files:** `posts.service.ts` (L443-452), `threads.service.ts` (L332-341)
- **Category:** Counter Integrity
- **Description:** When a post or thread is created, hashtag counters are incremented. But when deleted (soft-deleted), hashtag counters are never decremented. Over time, hashtag counts become vastly inflated.

#### [F12] Reel creation increments wrong hashtag counter
- **File:** `apps/api/src/modules/reels/reels.service.ts`
- **Lines:** 80-90
- **Category:** Counter Integrity
- **Description:** Reels increment `hashtag.postsCount` instead of a reel-specific counter (or a generic content count). This inflates the post count for hashtags when reels use them.

#### [F13-F15] ForYou feed cursor pagination broken across posts, threads, reels
- **Files:** `posts.service.ts` (L137), `threads.service.ts` (L175), `reels.service.ts` (L237)
- **Category:** Feed / Pagination
- **Description:** All three ForYou feeds:
  1. Fetch 200 recent items
  2. Score them by engagement
  3. Sort by score (NOT by createdAt)
  4. Use `findIndex` to paginate by createdAt cursor

  After step 3, items are no longer in createdAt order. The cursor pagination in step 4 searches for items with `createdAt < cursor` in the score-sorted array, which produces unpredictable results: duplicate items across pages, skipped items, or wrong page boundaries.

#### [F16-F17] Feeds ignore dismissed content
- **Files:** `posts.service.ts`, `threads.service.ts`
- **Category:** Feed Quality
- **Description:** The `dismiss` endpoints create `FeedDismissal` records, but no feed query ever reads or filters by these records. Users who dismiss content continue to see it.

#### [F18] ForYou feed includes scheduled posts
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 112-125
- **Category:** Feed
- **Description:** The ForYou feed where clause does not include `scheduledAt: null`. Scheduled posts (set to publish in the future) appear in the ForYou feed before their scheduled time. The following feed (line 197) correctly filters `scheduledAt: null`.

#### [F19-F21] Inline body extraction with no DTO validation
- **Files:** `stories.controller.ts` (L110-112, L176), `threads.controller.ts` (L250)
- **Category:** Validation
- **Description:** Multiple endpoints extract body parameters inline without proper DTO classes:
  - Story reply: `@Body('content') content: string` — no MaxLength, no sanitization
  - Sticker response: inline `{ stickerType: string; responseData: Record<string, unknown> }` — arbitrary JSON
  - Reply permission: `@Body('permission') permission` — no validation, any string accepted

#### [F22] Post deleteComment doesn't allow post owner to delete
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 878-891
- **Category:** Authorization
- **Description:** `deleteComment` only allows the comment author to delete. The post owner cannot delete comments on their own post. Compare with `reels.service.ts` `deleteComment` (L510-514) which correctly allows both the comment author AND the reel owner.

#### [F23-F24] Chronological and Favorites feeds don't filter by visibility
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 329-369, 371-411
- **Category:** Privacy
- **Description:** The chronological feed and favorites feed do not filter by post visibility. Posts with `visibility: 'CIRCLE'` or `visibility: 'FOLLOWERS'` from followed users appear even if the viewer is not in the circle or not a follower (in the case of favorites/circles).

#### [F25-F26] Feed caches never invalidated on user actions
- **Files:** `reels.service.ts` (L186-191, L281-284), `videos.service.ts` (L172-177, L262-264)
- **Category:** Stale Cache
- **Description:** Reel and video feeds are cached for 30 seconds. The cache is only set after fetching, never invalidated when the user likes, bookmarks, or creates content. For reels, the cache is invalidated on feed fetch (TTL only). This means personalization data (isLiked, isBookmarked) can be 30 seconds stale.

#### [F27-F30] Block bypass on getById for all content types
- **Files:** `posts.service.ts` (L549-576), `reels.service.ts` (L346-370), `videos.service.ts` (L270-307), `stories.service.ts` (L172-178)
- **Category:** Block Bypass
- **Description:** `getById` endpoints for posts, reels, videos, and stories do NOT check if the viewer is blocked by the content author. Blocked users can view any specific content by ID. Only `threads.getById` (L426-435) correctly checks for blocks in both directions.

#### [F31] Thread replyPermission not enforced server-side
- **File:** `apps/api/src/modules/threads/threads.service.ts`
- **Lines:** 679-707
- **Category:** Authorization
- **Description:** The `addReply` method does not call `canReply()` before creating the reply. The `canReply` method exists and is exposed as a separate endpoint, but it's purely informational. Any authenticated user can reply to any thread regardless of the thread's `replyPermission` setting. This makes the "following only" and "mentioned only" reply restrictions cosmetic.

#### [F32] Poll vote retract can produce negative counts
- **File:** `apps/api/src/modules/polls/polls.service.ts`
- **Lines:** 173-198
- **Category:** Counter Integrity
- **Description:** `retractVote` uses `decrement: 1` for both `votesCount` and `totalVotes`. If concurrent requests trigger two retracts, counts can go negative. All other counter decrements in the codebase use `GREATEST(x - 1, 0)` to prevent this.

#### [F33-F34] CrossPost doesn't update user postsCount or hashtag counters
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 1100-1130
- **Category:** Counter Integrity
- **Description:** `crossPost` creates new Post records in a loop but:
  1. Does not increment `user.postsCount` for the new posts
  2. Does not update hashtag counters for the copied hashtags
  3. Does not trigger moderation on the new posts
  4. Does not trigger analytics for the new posts

---

### P2: Moderate Issues

#### [F35-F37] Take:50 caps on follows/blocks/mutes queries
- **Files:** `posts.service.ts` (L164-166), `threads.service.ts` (L108-116), `stories.service.ts` (L52-55)
- **Category:** Data Limitation
- **Description:** All follow, block, and mute queries are capped at `take: 50`. Users with more than 50 follows, blocks, or mutes get incomplete filtering. Power users following hundreds of accounts will see an incomplete following feed.

#### [F38] Enrichment cap at 50
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Lines:** 417-426
- **Category:** Data Limitation
- **Description:** `enrichPostsForUser` queries reactions and saves with `take: 50`, but trending/forYou feeds fetch up to 200 posts. If a user has reacted to many posts, the enrichment may miss some, showing incorrect isLiked/isSaved state.

#### [F39] Highlights endpoint has no auth guard
- **File:** `apps/api/src/modules/stories/stories.controller.ts`
- **Line:** 45-48
- **Category:** Auth
- **Description:** `getHighlights` has no auth guard at all — publicly exposes highlight albums for any user, even if their account is private.

#### [F40] getShareLink returns URL for non-existent reels
- **File:** `apps/api/src/modules/reels/reels.service.ts`
- **Line:** 912-914
- **Category:** Validation
- **Description:** `getShareLink` returns `{ url: ... }` without checking if the reel exists or is removed. Returns a broken link for deleted reels.

#### [F41-F43] Missing rate limits on view endpoints
- **Files:** `stories.controller.ts`, `reels.controller.ts` (L163), `videos.controller.ts` (L177)
- **Category:** Abuse Vector
- **Description:** View recording endpoints have no rate limiting. Combined with the video view count inflation bug (F07), this allows trivial view farming.

#### [F44-F46] Missing content moderation for threads images, video descriptions, channel names
- **Files:** `threads.service.ts`, `videos.service.ts`, `channels.service.ts`
- **Category:** Moderation Gap
- **Description:** Threads, videos, and channels have no image moderation for uploaded media. Videos have no text moderation for descriptions. Channels have no moderation for names or descriptions.

#### [F47-F49] Reports use string description instead of FK
- **Files:** `threads.service.ts` (L800-804), `reels.service.ts` (L733-738), `videos.service.ts` (L658-663)
- **Category:** Data Model
- **Description:** Reports store the content reference as a string like `'thread:${threadId}'` in the `description` field instead of using proper FK fields. This makes it impossible to join reports with content for moderation dashboards.

#### [F50-F53] No duplicate report protection
- **Files:** All four content types
- **Category:** Abuse Vector
- **Description:** Users can submit unlimited reports for the same content, potentially flooding the moderation queue.

#### [F54-F55] Self-reaction and self-comment-like allowed
- **File:** `apps/api/src/modules/posts/posts.service.ts`
- **Category:** UX Inconsistency
- **Description:** Users can like their own posts and their own comments. The thread module prevents self-reposting but not self-liking. This inconsistency should be deliberate or prevented across the board.

#### [F56-F57] Missing sanitization in story replies and sticker responses
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 302-308, 425-433
- **Category:** Security
- **Description:** Story reply content and sticker response data are stored without `sanitizeText()` sanitization, unlike all other user content in the codebase.

#### [F58] Private account leak in story feed
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 51-108
- **Category:** Privacy
- **Description:** Story feed follows are based on the Follow table but don't re-check if accounts have since gone private.

#### [F59] Story delete is actually archive
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 181-191
- **Category:** Semantic
- **Description:** The `delete` method sets `isArchived: true` but returns `{ deleted: true }`. The API contract is misleading.

#### [F60] markViewed works on expired stories
- **File:** `apps/api/src/modules/stories/stories.service.ts`
- **Lines:** 205-224
- **Category:** Logic
- **Description:** `markViewed` does not check `expiresAt` — views can be recorded on expired stories.

#### [F61-F65] Missing functionality
- Reels have no edit/update endpoint (F62)
- Threads have no edit/update method (F63)
- Video comments have no delete endpoint (F64)
- Video comment likes field exists but no like/unlike endpoint (F65)

#### [F66-F68] Channel hard delete, poll voter privacy, poll voter no auth
- As described in the summary table above.

#### [F69-F70] Inconsistent hard/soft delete for replies and reel comments
- Thread replies use hard delete (cascade destroys child replies)
- Reel comments use hard delete
- Post comments use soft delete (isRemoved: true)

#### [F71-F72] Missing story notifications and view tracking on getById
- Story creation sends no notifications to followers
- Direct story access via `getById` doesn't record a view

---

### P3: Minor Issues

#### [F73] POST_SELECT exposes isRemoved flag
- **File:** `apps/api/src/modules/posts/posts.service.ts`, Line 45
- **Description:** The select object includes `isRemoved: true`, leaking internal moderation state to clients.

#### [F74] Inconsistent pagination in story viewers
- **File:** `apps/api/src/modules/stories/stories.service.ts`, Lines 230-237
- **Description:** Uses `viewerId: { gt: cursor }` instead of cursor-skip pattern.

#### [F75] getShareLink doesn't validate reel exists
- Already covered above.

#### [F76-F79] Missing edit timestamps, unused imports
- Posts and comments have no editedAt tracking
- Reel ReportReason import used only as cast

#### [F80-F82] Missing gamification for stories and channels
- Stories and channels don't award XP on creation, unlike all other content types.

#### [F83-F86] Minor controller/service inconsistencies
- hideComment passes unused post ID
- Thread reply awards no XP
- Feed cache only invalidated for author
- Trending fallback doesn't filter scheduledAt

#### [F87-F90] Reel isRemoved not checked on like/unlike/comment/share
- Multiple reel interaction endpoints check `status === READY` but not `isRemoved` — can interact with soft-deleted reels.

#### [F91-F94] Minor premiere, end-screen, video feed, poll issues
- Premiere reminder duplicate not handled
- End screen data spread from untrusted input
- Video feed orderBy conflict
- Poll retract works on expired polls

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| P0 | 9 |
| P1 | 26 |
| P2 | 38 |
| P3 | 21 |
| **Total** | **94** |

### Top 5 Themes

1. **Block bypass / Privacy leaks (12 findings):** Content accessible by blocked users, private stories visible without auth, closeFriendsOnly/subscribersOnly not enforced
2. **Counter integrity (9 findings):** Hashtag counts never decremented, video views infinitely inflatable, poll counts can go negative, cross-post doesn't update counts
3. **Inconsistent delete strategy (6 findings):** Videos and channels use hard delete while everything else uses soft delete; thread replies hard-deleted, post comments soft-deleted
4. **Missing moderation (5 findings):** Reel moderation references wrong field (never fires), threads/videos/channels have no image moderation
5. **Broken cursor pagination (3 findings):** ForYou feeds across posts/threads/reels sort by engagement score but paginate by createdAt cursor
