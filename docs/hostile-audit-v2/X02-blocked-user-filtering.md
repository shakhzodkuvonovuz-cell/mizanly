# X02 — Cross-Module Blocked/Muted User Filtering Audit

**Date:** 2026-04-05
**Auditor:** Claude Opus 4.6 (hostile audit, no code fixes)
**Scope:** Every user-facing query in `apps/api` that returns content or user lists. Verify blocked/muted users are filtered from ALL results.

---

## 1. Core Exclusion Mechanism

**File:** `apps/api/src/common/utils/excluded-users.ts`

The `getExcludedUserIds(prisma, redis, userId)` utility is the single source of truth. It:
- Queries `Block` (bidirectional: both `blockerId=userId` AND `blockedId=userId`)
- Queries `Mute` (unidirectional: `userId=userId`)
- Queries `Restrict` (unidirectional: `restricterId=userId`)
- Unions all IDs into a `Set<string>`
- Caches in Redis for 60 seconds (skips caching for sets >1000 IDs)
- Upper bound of 10,000 per relation type (safety cap)

**Verdict:** Core mechanism is sound. Bidirectional blocks, unidirectional mutes/restricts. Correct.

---

## 2. Module-by-Module Coverage

### PASS — Modules correctly applying `getExcludedUserIds`

| Module | Service | Methods | Filter Applied | Notes |
|--------|---------|---------|----------------|-------|
| **Feed** | `feed.service.ts` | `getTrendingFeed`, `getFeaturedFeed`, `getNearbyContent`, `getCommunityTrending`, `getSuggestedUsers`, `getFrequentCreators` | YES | All use `getExcludedUserIds`. SQL raw query in `getTrendingFeed` also applies `excludeUserClause`. |
| **Personalized Feed** | `personalized-feed.service.ts` | `getPersonalizedFeed`, `getColdStartFeed`, `getTrendingFeed` | YES | Uses `getExcludedUserIds`. Also filters in scoring loop via `excludedSet.has(meta.userId)`. |
| **Posts** | `posts.service.ts` | `getFeed` (all types: following, foryou, chronological, favorites), `getTrendingFallback`, `getBlendedFeed`, `getComments` | YES | All feed methods use `getExcludedUserIds`. Comments also filter. |
| **Threads** | `threads.service.ts` | `getFeed` (foryou, following, trending), `getTrendingThreads`, `getBlendedThreadFeed`, `getReplies` | YES | All feed methods use `getExcludedUserIds`. Replies also filter. |
| **Reels** | `reels.service.ts` | `getFeed`, `getComments` | YES | Feed and comments both filter. |
| **Videos** | `videos.service.ts` | `getFeed` | YES | Filters blocked/muted users. |
| **Search** | `search.service.ts` | `search` (all types: people, posts, threads, reels, videos, channels), `searchPosts`, `searchThreads`, `searchReels`, `getExploreFeed`, `getSuggestions`, `trending`, `getHashtagPosts` | YES | All search methods filter. Meilisearch post-filter also applies `excludedSet`. |
| **Recommendations** | `recommendations.service.ts` | `suggestedPeople`, `suggestedPosts`, `suggestedReels`, `suggestedChannels`, `suggestedThreads`, `getExplorationPosts/Reels/Threads` | YES | All use `getExcludedUserIds`. Also filters in diversity pass. |
| **Stories** | `stories.service.ts` | `getFeedStories` | YES | Excludes blocked/muted from story feed. |
| **Channel Posts** | `channel-posts.service.ts` | `getFeed` | YES | Filters blocked/muted. |
| **Channels** | `channels.service.ts` | Imports and uses `getExcludedUserIds` | YES | Applied in channel-level queries. |

### PASS — Modules using direct block checks (correct for single-entity access)

| Module | Service | Methods | Filter Applied | Notes |
|--------|---------|---------|----------------|-------|
| **Posts** | `posts.service.ts` | `getById` | YES (direct block check) | Queries `Block` bidirectionally, returns 404. Correct for single-entity. |
| **Threads** | `threads.service.ts` | `getById`, `getUserThreads` | YES (direct block check) | Both check `Block.findFirst` bidirectionally. |
| **Reels** | `reels.service.ts` | `getById`, `getUserReels` | YES | `getById` checks block. `getUserReels` checks block. |
| **Videos** | `videos.service.ts` | `getById` | YES (direct block check) | Bidirectional block check. |
| **Stories** | `stories.service.ts` | `getById`, `replyToStory`, `reactToStory`, `submitStickerResponse` | YES (direct block check) | All check `Block.findFirst` bidirectionally. |
| **Users** | `users.service.ts` | `getUserPosts`, `getUserThreads`, `getSimilarAccounts` | YES (direct block check) | All check block. `getSimilarAccounts` also filters blocked from results. |
| **Collabs** | `collabs.service.ts` | `invite` | YES (direct block check) | Cannot invite blocked users. |
| **Messages** | `messages.service.ts` | `getMessages` | YES | Filters blocked sender IDs from message list. 10K cap on block query (safety-critical). |

---

## 3. FINDINGS — Gaps and Issues

### CRITICAL

#### X02-C1: `search.service.ts` — `suggestedUsers()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/search/search.service.ts`, line 546
**Method:** `suggestedUsers(userId: string)`
**Issue:** This method fetches users based on shared interests but only excludes the user's own following list. It does NOT call `getExcludedUserIds()` and does NOT filter blocked/muted users from results. A blocked user with matching interests will appear in suggestions.
```typescript
// Line 562: Missing exclusion — only filters followingIds, NOT blocked/muted
return this.prisma.user.findMany({
  where: {
    id: { notIn: [...myFollowingIds, userId] }, // <-- NO blocked/muted IDs here
    ...
  },
```
**Impact:** Blocked users appear in "suggested users" — direct privacy violation.

#### X02-C2: `reels.service.ts` — `getTrendingReels()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/reels/reels.service.ts`, line 433
**Method:** `getTrendingReels(cursor?, limit?)`
**Issue:** This method does not accept a `userId` parameter and does not call `getExcludedUserIds()`. The scored feed cache key is `sfeed:bakra:trending` (not per-user), so even if a user is authenticated, their blocked users' reels appear in trending.
```typescript
async getTrendingReels(cursor?: string, limit = 20) {
  // No userId parameter, no exclusion filter
  const reels = await this.prisma.reel.findMany({
    where: {
      // ...no exclusion of blocked/muted users
    },
  });
```
**Impact:** Blocked users' reels appear in trending reels feed for all authenticated users.

### HIGH

#### X02-H1: `posts.service.ts` — `getCommentReplies()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/posts/posts.service.ts`, line 1279
**Method:** `getCommentReplies(commentId, cursor?, limit?)`
**Issue:** While `getComments()` correctly filters via `getExcludedUserIds()`, nested replies (`getCommentReplies`) do NOT. The method does not accept a `viewerId` parameter and does not filter blocked/muted users.
```typescript
async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
  // No viewerId parameter, no exclusion filter
  const replies = await this.prisma.comment.findMany({
    where: { parentId: commentId, isRemoved: false, isHidden: false,
      user: { isBanned: false, ... } }, // <-- NO blocked/muted filter
  });
```
**Impact:** Blocked users' comment replies are visible. Lower impact than top-level comments (replies require expanding a thread), but still a leak.

#### X02-H2: `videos.service.ts` — `getComments()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 737
**Method:** `getComments(videoId, cursor?, limit?)`
**Issue:** Unlike `posts.service.ts` and `reels.service.ts` which correctly filter comments, `videos.service.ts` `getComments()` does NOT accept a `userId`/`viewerId` parameter and does NOT call `getExcludedUserIds()`. Only filters `isBanned/isDeactivated/isDeleted`.
```typescript
async getComments(videoId: string, cursor?: string, limit = 20) {
  // No userId parameter, no exclusion filter for blocked/muted
  const comments = await this.prisma.videoComment.findMany({
    where: { videoId, parentId: null, isDeleted: false,
      user: { isBanned: false, ... } }, // <-- NO blocked/muted filter
  });
```
**Impact:** Blocked/muted users' comments visible on videos.

#### X02-H3: `videos.service.ts` — `getCommentReplies()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/videos/videos.service.ts`, line 1009
**Method:** `getCommentReplies(commentId, cursor?, limit?)`
**Issue:** Same as H2 but for nested replies. No `viewerId`, no exclusion filter.
**Impact:** Blocked users' video comment replies visible.

#### X02-H4: `audio-rooms.service.ts` — `list()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, line 126
**Method:** `list(viewerId?, cursor?, limit?)`
**Issue:** Lists all live/scheduled audio rooms. Does not call `getExcludedUserIds()` to filter rooms hosted by blocked users. A blocked user's audio room appears in the listing.
```typescript
async list(viewerId: string | undefined, cursor?: string, limit = 20) {
  const where: Prisma.AudioRoomWhereInput = {
    OR: [{ status: 'live' }, { status: 'scheduled' }],
  };
  // viewerId is accepted but NEVER USED for any filtering
```
**Impact:** Blocked users' audio rooms visible in browse. Also, room participants list (`ROOM_SELECT`) includes blocked users.

#### X02-H5: `audio-rooms.service.ts` — `getById()` does NOT check blocks
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`, line 153
**Method:** `getById(id, viewerId?)`
**Issue:** Does not check if the viewer has blocked or is blocked by the room host. Returns room details including all participants (which may include blocked users).
**Impact:** Blocked user's audio room accessible via direct link.

#### X02-H6: `live.service.ts` — `getActive()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/live/live.service.ts`, line 108
**Method:** `getActive(liveType?, cursor?, limit?)`
**Issue:** Lists active live sessions. Does NOT accept a `userId` parameter. Filters `host.isBanned/isDeactivated/isDeleted` but not blocked/muted hosts. A blocked user's live stream appears in the active listing.
**Impact:** Blocked users' live streams visible in browse.

#### X02-H7: `live.service.ts` — `getById()` and `getParticipants()` do NOT check blocks
**File:** `apps/api/src/modules/live/live.service.ts`, lines 67 and 355
**Issue:** `getById` does not check block status between viewer and host. `getParticipants` returns all participants including those blocked by the viewer.
**Impact:** Blocked user's live session accessible; blocked users visible in participant list.

### MEDIUM

#### X02-M1: `communities.service.ts` — `list()` does NOT filter blocked owners
**File:** `apps/api/src/modules/communities/communities.service.ts`, line 137
**Method:** `list(viewerId?, cursor?, limit?)`
**Issue:** Lists communities without filtering out communities owned by blocked users. The owner is returned in `CIRCLE_SELECT` (includes `owner` relation).
**Impact:** Blocked user's community appears in the browse listing with their profile visible.

#### X02-M2: `communities.service.ts` — `listMembers()` does NOT filter blocked/muted members
**File:** `apps/api/src/modules/communities/communities.service.ts`, line 341
**Method:** `listMembers(id, viewerId?, cursor?, limit?)`
**Issue:** Returns all community members without filtering blocked/muted users from the viewer's perspective. A blocked user appears in the member list.
**Impact:** Blocked users visible in community member list.

#### X02-M3: `communities.service.ts` — `getById()` does NOT check blocks against owner
**File:** `apps/api/src/modules/communities/communities.service.ts`, line 180
**Issue:** Does not check if the viewer has blocked or is blocked by the community owner. Owner profile is returned.
**Impact:** Blocked user's community detail accessible with owner profile visible.

#### X02-M4: `story-chains.service.ts` — `getTrending()` and `getChain()` do NOT filter blocked users
**File:** `apps/api/src/modules/story-chains/story-chains.service.ts`, lines 34 and 61
**Issue:** `getTrending()` lists chains without filtering blocked creators. `getChain()` returns entries with associated users without filtering blocked participants. No `getExcludedUserIds` usage anywhere in this service.
**Impact:** Blocked users' story chains and entries visible in trending and chain detail.

#### X02-M5: `mosques.service.ts` — `getFeed()` and `getMembers()` do NOT filter blocked users
**File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 125 and 156
**Issue:** `getFeed()` returns all mosque posts without filtering blocked authors. `getMembers()` filters `isBanned/isDeactivated/isDeleted` but NOT blocked/muted users from the viewer's perspective.
**Impact:** Blocked users' mosque posts visible; blocked users in member list.

#### X02-M6: `follows.service.ts` — `getFollowers()` and `getFollowing()` do NOT filter blocked/muted users
**File:** `apps/api/src/modules/follows/follows.service.ts`, lines 202 and 257
**Issue:** Both methods filter `isBanned/isDeactivated/isDeleted` but do NOT filter users who are blocked/muted by the VIEWER. If user A views user B's followers list, blocked users appear in the list. Follows are removed on block (correct), but if A blocks C, and B follows C, C appears in B's follower list viewed by A.
**Impact:** Blocked users' profiles visible in other users' follower/following lists. Lower severity because the viewer is browsing someone else's list.

#### X02-M7: `notifications.service.ts` — `getNotifications()` filters banned/deactivated but NOT blocked/muted actors
**File:** `apps/api/src/modules/notifications/notifications.service.ts`, line 20
**Issue:** Filters `!n.actor?.isBanned && !n.actor?.isDeactivated` but does NOT filter notifications from blocked/muted users. If user A blocks user B, and B had previously liked A's post, the notification persists and B's profile is visible in the notification.
**Impact:** Blocked users' profiles visible in notification history. Low severity (only historical notifications).

#### X02-M8: `stories.service.ts` — `getViewers()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/stories/stories.service.ts`, line 377
**Method:** `getViewers(storyId, ownerId, cursor?, limit?)`
**Issue:** Returns all story viewers without filtering blocked/muted users. If the story owner blocks someone, that person's view record persists and their profile appears in the viewers list.
**Impact:** Blocked users' profiles visible in story viewer list.

#### X02-M9: `channel-posts.service.ts` — `getById()` does NOT check blocks
**File:** `apps/api/src/modules/channel-posts/channel-posts.service.ts`, line 79
**Method:** `getById(postId)`
**Issue:** Returns channel post detail without checking if the viewer has blocked the post author or vice versa. No `userId` parameter.
**Impact:** Blocked user's channel post accessible via direct link.

#### X02-M10: `channels.service.ts` — `getSubscribers()` does NOT filter blocked/muted users
**File:** `apps/api/src/modules/channels/channels.service.ts`, line 411
**Method:** `getSubscribers(handle, userId, cursor?, limit?)`
**Issue:** Returns all channel subscribers. Does not filter blocked/muted users from the subscriber list. Only accessible by channel owner, but blocked users still appear.
**Impact:** Blocked users' profiles visible in subscriber list (owner-only view).

### LOW

#### X02-L1: `live.service.ts` — `getParticipants()` includes blocked users in participant list
Already covered in H7 but noting explicitly: no exclusion filter on participants.

#### X02-L2: Muted vs Blocked distinction not granular in comments
**Observation:** The exclusion system treats blocks and mutes identically (both excluded from all content). In most social platforms, muted users are hidden from YOUR feed but can still see YOUR content and comment. Currently, muting a user also hides their comments, which may be overly aggressive. This is a design decision rather than a bug, but worth documenting.

#### X02-L3: `getExcludedUserIds` 60-second cache means block is not instant
**Observation:** After blocking someone, their content can appear for up to 60 seconds due to Redis caching. The cache is per-user, so only the blocker is affected. The `blocks.service.ts` does not invalidate the excluded-users cache on block/unblock.
**File:** `apps/api/src/modules/blocks/blocks.service.ts` — `block()` method invalidates `user:${username}` cache but NOT `excluded:users:${userId}` cache.

---

## 4. Bidirectionality Verification

**PASS:** The `getExcludedUserIds` function correctly queries `Block` with `OR: [{ blockerId: userId }, { blockedId: userId }]`, meaning if A blocks B, both A and B get each other in their excluded list. This is correct bidirectional enforcement.

**PASS:** All direct block checks in `getById` methods use the same bidirectional pattern: `OR: [{ blockerId: viewerId, blockedId: authorId }, { blockerId: authorId, blockedId: viewerId }]`.

---

## 5. Group Conversations

**PASS:** `messages.service.ts` `getMessages()` filters blocked sender IDs from message results in both 1:1 and group conversations. The block query has a 10,000 cap (safety-critical). Blocked users' messages are hidden but the conversation itself remains visible (correct for group chats).

**PASS:** `blocks.service.ts` `cleanupAfterBlock()` archives shared 1:1 DM conversations on block.

**OBSERVATION:** In group conversations, a blocked user remains a member but their messages are filtered for the blocker. This is the correct behavior (cannot force-remove from groups).

---

## 6. Summary Table

| Severity | Count | IDs |
|----------|-------|-----|
| **CRITICAL** | 2 | X02-C1, X02-C2 |
| **HIGH** | 7 | X02-H1 through X02-H7 |
| **MEDIUM** | 10 | X02-M1 through X02-M10 |
| **LOW** | 3 | X02-L1 through X02-L3 |
| **TOTAL** | **22** | |

---

## 7. Modules With Complete Coverage (no findings)

- `feed.service.ts` — all 7 public methods filter correctly
- `personalized-feed.service.ts` — all methods filter correctly
- `posts.service.ts` — feeds and top-level comments filter (only nested replies missing)
- `threads.service.ts` — feeds, trending, replies all filter correctly
- `reels.service.ts` — feed and comments filter (only trending missing)
- `search.service.ts` — all 12+ search/explore/hashtag methods filter (only `suggestedUsers` missing)
- `recommendations.service.ts` — all 5 suggestion methods filter correctly
- `stories.service.ts` — feed stories filter correctly (only viewers list missing)
- `channel-posts.service.ts` — getFeed filters correctly (only getById missing)
- `videos.service.ts` — getFeed and getById filter (only comments missing)
- `messages.service.ts` — getMessages filters blocked senders correctly
- `collabs.service.ts` — invite checks blocks correctly

---

## 8. Priority Fix Order

1. **X02-C1** — `search.suggestedUsers()`: Add `getExcludedUserIds` call, add to `notIn` filter. ~5 lines.
2. **X02-C2** — `reels.getTrendingReels()`: Add `userId` parameter, filter excluded IDs. Requires per-user cache key or post-filter. ~10 lines.
3. **X02-H2** — `videos.getComments()`: Add `userId` parameter, call `getExcludedUserIds`, apply filter. ~5 lines.
4. **X02-H1** — `posts.getCommentReplies()`: Add `viewerId` parameter, call `getExcludedUserIds`, apply filter. ~5 lines.
5. **X02-H3** — `videos.getCommentReplies()`: Same as H1. ~5 lines.
6. **X02-H4/H5** — `audio-rooms.list()/getById()`: Add exclusion filter for hosts and participants. ~15 lines.
7. **X02-H6/H7** — `live.getActive()/getById()/getParticipants()`: Add userId parameter and exclusion. ~15 lines.
8. **X02-M1-M3** — `communities` list/listMembers/getById: Add exclusion filter. ~15 lines.
9. **X02-M4** — `story-chains`: Add exclusion filter. ~10 lines.
10. **X02-M5** — `mosques`: Add exclusion filter. ~10 lines.
11. **X02-L3** — Cache invalidation: Add `redis.del(excluded:users:${blockerId})` and `redis.del(excluded:users:${blockedId})` in `blocks.service.ts` `block()` and `unblock()`. ~4 lines.
