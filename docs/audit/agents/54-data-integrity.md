# Agent #54 — Data Integrity (Cross-Cutting)

**Scope:** All backend service files — counter sync, race conditions, orphaned records, double-spend, view inflation, soft-vs-hard delete inconsistency, counter clamping gaps.

**Method:** Line-by-line read of every service file that mutates counters or creates/deletes records with associated denormalized counts.

---

## Finding 1: VIDEO VIEWS INFINITELY INFLATABLE — NO DEDUP

**File:** `apps/api/src/modules/videos/videos.service.ts`
**Lines:** 614-636
**Severity:** HIGH
**Category:** Counter inflation / data integrity

```typescript
async view(videoId: string, userId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new NotFoundException('Video not found');

    // Check if already viewed recently? For simplicity, just increment.
    await this.prisma.$transaction([
      this.prisma.video.update({
        where: { id: videoId },
        data: { viewsCount: { increment: 1 } },
      }),
      this.prisma.channel.update({
        where: { id: video.channelId },
        data: { totalViews: { increment: 1 } },
      }),
      // Create or update watch history
      this.prisma.watchHistory.upsert({
        where: { userId_videoId: { userId, videoId } },
        create: { userId, videoId, watchedAt: new Date() },
        update: { watchedAt: new Date() },
      }),
    ]);
    return { viewed: true };
  }
```

**Problem:** The comment literally says "For simplicity, just increment." Every call increments `viewsCount` on both Video and Channel regardless of whether the same user already viewed it. The `watchHistory.upsert` tracks the user's last watch time but does NOT gate the view increment. A single user can inflate views infinitely by calling this endpoint repeatedly. This is the same user whose watch history is being updated (not created) — proving the view was already counted.

**Impact:** All video view counts are meaningless. Channel `totalViews` is equally inflatable. This breaks analytics, trending algorithms, and creator monetization metrics.

**Fix:** Check if `watchHistory` already exists before incrementing, or use the reel pattern (which correctly deduplicates):
```typescript
const existing = await this.prisma.watchHistory.findUnique({
  where: { userId_videoId: { userId, videoId } },
});
if (!existing) {
  // Only increment on first view
}
```

---

## Finding 2: GIFT sendGift RACE CONDITION — DOUBLE-SPEND POSSIBLE

**File:** `apps/api/src/modules/gifts/gifts.service.ts`
**Lines:** 89-163
**Severity:** CRITICAL
**Category:** Race condition / double-spend

```typescript
async sendGift(senderId: string, data: SendGiftData) {
    // ...
    // Check sender has enough coins
    const senderBalance = await this.prisma.coinBalance.findUnique({
      where: { userId: senderId },
    });
    if (!senderBalance || senderBalance.coins < catalogItem.coins) {
      throw new BadRequestException('Insufficient coins');
    }
    // ... then later:
    this.prisma.coinBalance.update({
      where: { userId: senderId },
      data: { coins: { decrement: catalogItem.coins } },
    }),
```

**Problem:** The balance check (`findUnique`) and the deduction (`update with decrement`) are separated by time. Two concurrent requests can both pass the balance check, then both decrement. With a balance of 100 coins and a 100-coin gift, two simultaneous requests would both pass the check, resulting in a balance of -100 (or whatever the initial balance was minus 200).

The transaction uses a sequential/batch `$transaction([...])` which provides atomicity but NOT isolation — both transactions can read the same balance before either writes.

**Impact:** Users can send gifts they cannot afford, creating negative coin balances. This is a financial exploit.

**Fix:** Use a conditional update pattern (like `cashout` already does on line 226):
```typescript
const updated = await this.prisma.coinBalance.updateMany({
  where: { userId: senderId, coins: { gte: catalogItem.coins } },
  data: { coins: { decrement: catalogItem.coins } },
});
if (updated.count === 0) throw new BadRequestException('Insufficient coins');
```

The `cashout` method (line 226) already uses this pattern correctly. `sendGift` does not.

---

## Finding 3: COIN BALANCE CAN GO NEGATIVE via sendGift

**File:** `apps/api/src/modules/gifts/gifts.service.ts`
**Lines:** 135-137
**Severity:** CRITICAL
**Category:** Counter not clamped

```typescript
this.prisma.coinBalance.update({
  where: { userId: senderId },
  data: { coins: { decrement: catalogItem.coins } },
}),
```

**Problem:** Prisma's `decrement` does not clamp to zero. If the balance is 50 and someone sends a 100-coin gift (passing the race condition in Finding 2), the balance becomes -50. There is no `GREATEST(coins - amount, 0)` protection.

**Impact:** Negative coin balances in the database. Breaks financial integrity.

---

## Finding 4: purchaseCoins GIVES FREE COINS WITHOUT PAYMENT

**File:** `apps/api/src/modules/gifts/gifts.service.ts`
**Lines:** 63-87
**Severity:** CRITICAL
**Category:** Data integrity / free money

```typescript
async purchaseCoins(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer');
    }

    const balance = await this.prisma.coinBalance.upsert({
      where: { userId },
      update: { coins: { increment: amount } },
      create: { userId, coins: amount, diamonds: 0 },
    });
```

**Problem:** This method directly increments coins without any payment verification. There is no Stripe charge, no payment intent, no receipt — just raw balance increment. Anyone can call this endpoint and get unlimited free coins.

**Impact:** Complete financial system bypass. Users can acquire unlimited coins for free, then send gifts to receivers who convert to diamonds and cash out real money.

---

## Finding 5: POLL VOTE COUNTS NOT CLAMPED — CAN GO NEGATIVE

**File:** `apps/api/src/modules/polls/polls.service.ts`
**Lines:** 173-198
**Severity:** MEDIUM
**Category:** Counter not clamped

```typescript
async retractVote(pollId: string, userId: string) {
    // ...
    await this.prisma.$transaction([
      this.prisma.pollVote.delete({ ... }),
      this.prisma.pollOption.update({
        where: { id: vote.optionId },
        data: { votesCount: { decrement: 1 } },
      }),
      this.prisma.poll.update({
        where: { id: pollId },
        data: { totalVotes: { decrement: 1 } },
      }),
    ]);
```

**Problem:** Both `votesCount` and `totalVotes` use raw `decrement: 1` without GREATEST clamping. If data gets out of sync (e.g., a vote was already cleaned up by a cascade delete), these counters can go negative.

**Impact:** Negative vote counts displayed on polls. Percentage calculations break (negative / total).

---

## Finding 6: COMMUNITY membersCount NOT CLAMPED ON LEAVE

**File:** `apps/api/src/modules/communities/communities.service.ts`
**Lines:** 314-322
**Severity:** MEDIUM
**Category:** Counter not clamped

```typescript
await this.prisma.$transaction([
  this.prisma.circleMember.delete({
    where: { circleId_userId: { circleId: id, userId } },
  }),
  this.prisma.circle.update({
    where: { id },
    data: { membersCount: { decrement: 1 } },
  }),
]);
```

**Problem:** `membersCount` uses `decrement: 1` without GREATEST clamping. If double-leave occurs (e.g., two concurrent requests) or if the count was already wrong, it goes negative.

**Compare with:** The `join` method uses `increment: 1` (also not clamped against double-join, but ConflictException guards it).

---

## Finding 7: SERIES followersCount NOT CLAMPED ON UNFOLLOW

**File:** `apps/api/src/modules/gamification/gamification.service.ts`
**Lines:** 455-464
**Severity:** MEDIUM
**Category:** Counter not clamped

```typescript
async unfollowSeries(userId: string, seriesId: string) {
    await this.prisma.$transaction([
      this.prisma.seriesFollower.delete({
        where: { seriesId_userId: { seriesId, userId } },
      }),
      this.prisma.series.update({
        where: { id: seriesId },
        data: { followersCount: { decrement: 1 } },
      }),
    ]);
    return { success: true };
  }
```

**Problem:** `followersCount` uses raw `decrement: 1`. If the delete fails (P2025 — not found), the transaction would fail, so this is partially protected. However, if the follow was already deleted by a cascade (e.g., series deletion + re-creation), the count goes wrong.

Additionally, if `unfollowSeries` is called when the user isn't following (no prior check), the delete will throw P2025 which is not caught, resulting in a 500 error rather than a clean error message.

---

## Finding 8: CHANNEL POST LIKES INFINITELY INFLATABLE — NO DEDUP

**File:** `apps/api/src/modules/channel-posts/channel-posts.service.ts`
**Lines:** 66-73
**Severity:** HIGH
**Category:** Counter inflation

```typescript
async like(postId: string, _userId: string) {
    const post = await this.prisma.channelPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Community post not found');

    await this.prisma.$executeRaw`UPDATE "channel_posts" SET "likesCount" = "likesCount" + 1 WHERE id = ${postId}`;
    return { liked: true };
  }
```

**Problem:** The `_userId` parameter is accepted but completely ignored. There is:
1. No per-user deduplication (no reaction/like record created)
2. No check if the user already liked
3. No way to unlike (the unlike method also has no dedup)

A single user can call `like` repeatedly to inflate `likesCount` to any value.

**Impact:** Channel post like counts are meaningless. The `unlike` method at line 75-81 similarly just decrements without checking if the user actually liked.

---

## Finding 9: CHANNEL POST unlike WITHOUT VERIFYING USER LIKED

**File:** `apps/api/src/modules/channel-posts/channel-posts.service.ts`
**Lines:** 75-82
**Severity:** HIGH
**Category:** Counter manipulation

```typescript
async unlike(postId: string, _userId: string) {
    const post = await this.prisma.channelPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Community post not found');

    await this.prisma.$executeRaw`UPDATE "channel_posts" SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`;
    return { unliked: true };
  }
```

**Problem:** Any user can call `unlike` on any post without ever having liked it, decrementing the count. While GREATEST prevents going below 0, it still allows malicious deflation by calling unlike more times than likes exist.

---

## Finding 10: BOOKMARK COUNTER DOUBLE-INCREMENT ON P2002 IN bookmarks.service.ts saveVideo

**File:** `apps/api/src/modules/bookmarks/bookmarks.service.ts`
**Lines:** 135-162
**Severity:** MEDIUM
**Category:** Race condition / counter sync

```typescript
async saveVideo(userId: string, videoId: string) {
    // ...
    try {
      const [bookmark] = await this.prisma.$transaction([
        this.prisma.videoBookmark.create({
          data: { userId, videoId },
        }),
        this.prisma.video.update({
          where: { id: videoId },
          data: { savesCount: { increment: 1 } },
        }),
      ]);
      return bookmark;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.videoBookmark.findUnique({
          where: { userId_videoId: { userId, videoId } },
        });
        return existing;
      }
      throw error;
    }
  }
```

**Problem:** On P2002 (duplicate), the transaction rolls back entirely (both the create AND the increment), so the counter is not double-incremented. This is actually correct. However, there is a subtle issue: the `videos.service.ts` `bookmark` method at line 578-596 ALSO handles video bookmarking with the same counter increment. If both code paths are reachable, the same bookmark could increment `savesCount` via different routes.

Looking at `videos.service.ts` line 578:
```typescript
async bookmark(videoId: string, userId: string) {
    // ... checks existing, throws ConflictException
    await this.prisma.$transaction([
      this.prisma.videoBookmark.create({ data: { userId, videoId } }),
      this.prisma.video.update({ where: { id: videoId }, data: { savesCount: { increment: 1 } } }),
    ]);
```

**Impact:** Two different services manage the same bookmark + counter. If the controller routes are both exposed, they could cause confusion but not double-counting (both would fail on P2002). The real issue is maintenance — changes to one path may not be reflected in the other.

---

## Finding 11: THREAD DELETE DOES NOT DECREMENT HASHTAG COUNTS

**File:** `apps/api/src/modules/threads/threads.service.ts`
**Lines:** 452-464
**Severity:** MEDIUM
**Category:** Counter desync on delete

```typescript
async delete(threadId: string, userId: string) {
    const thread = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.thread.update({
        where: { id: threadId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "threadsCount" = GREATEST("threadsCount" - 1, 0) WHERE id = ${userId}`,
    ]);
    return { deleted: true };
  }
```

**Problem:** When a thread is created (`create` at line 329), hashtag counts are incremented via `hashtag.upsert({ update: { threadsCount: { increment: 1 } } })`. When the thread is deleted (soft-deleted via `isRemoved: true`), the hashtag counts are NEVER decremented. Over time, hashtag counts become inflated as deleted content still contributes to them.

**Impact:** Trending hashtag rankings become skewed by deleted content. Hashtag detail pages show inflated counts.

---

## Finding 12: POST DELETE DOES NOT DECREMENT HASHTAG COUNTS

**File:** `apps/api/src/modules/posts/posts.service.ts`
**Lines:** 597-612
**Severity:** MEDIUM
**Category:** Counter desync on delete

```typescript
async delete(postId: string, userId: string) {
    // ...
    await this.prisma.$transaction([
      this.prisma.post.update({
        where: { id: postId },
        data: { isRemoved: true, removedAt: new Date(), removedById: userId },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}`,
    ]);
```

**Problem:** Same as Finding 11 — post creation increments hashtag `postsCount`, but post deletion never decrements it.

---

## Finding 13: REEL DELETE DOES NOT DECREMENT HASHTAG COUNTS

**File:** `apps/api/src/modules/reels/reels.service.ts`
**Lines:** 372-393
**Severity:** MEDIUM
**Category:** Counter desync on delete

```typescript
async delete(reelId: string, userId: string) {
    // ...
    await this.prisma.$transaction([
      this.prisma.reel.update({
        where: { id: reelId },
        data: { isRemoved: true },
      }),
      this.prisma.$executeRaw`UPDATE "User" SET "reelsCount" = GREATEST("reelsCount" - 1, 0) WHERE id = ${userId}`,
    ]);
```

**Problem:** Same pattern — reel creation at line 80-90 upserts hashtags with `postsCount: { increment: 1 }` (NOTE: this increments `postsCount` not `reelsCount` on the hashtag — see Finding 14), but deletion never decrements.

---

## Finding 14: REEL CREATION INCREMENTS WRONG HASHTAG COUNTER

**File:** `apps/api/src/modules/reels/reels.service.ts`
**Lines:** 80-90
**Severity:** MEDIUM
**Category:** Wrong counter field

```typescript
if (hashtagNames.length > 0) {
  await Promise.all(
    hashtagNames.map((name) =>
      this.prisma.hashtag.upsert({
        where: { name },
        create: { name, postsCount: 1 },
        update: { postsCount: { increment: 1 } },
      }),
    ),
  );
}
```

**Problem:** When a reel uses hashtags, the code increments `postsCount` on the Hashtag model instead of `reelsCount`. This means:
- Hashtag `postsCount` is inflated (includes reels)
- Hashtag `reelsCount` is always 0 (never incremented)
- The trending hashtag query at `hashtags.service.ts` line 155-176 sums `postsCount + reelsCount + threadsCount + videosCount`, so `reelsCount` contribution is always 0

**Impact:** Reel hashtag activity not properly tracked. Trending calculations undercount reel engagement.

---

## Finding 15: SOFT DELETE vs HARD DELETE INCONSISTENCY

**Severity:** MEDIUM
**Category:** Inconsistent deletion strategy

| Entity | Delete Strategy | File | Line |
|--------|----------------|------|------|
| Post | Soft delete (`isRemoved: true`) | posts.service.ts | 603 |
| Thread | Soft delete (`isRemoved: true`) | threads.service.ts | 459 |
| Reel | Soft delete (`isRemoved: true`) | reels.service.ts | 379 |
| Video | **Hard delete** (`video.delete`) | videos.service.ts | 351 |
| Story | Soft delete (`isArchived: true`) via "delete" | stories.service.ts | 186 |
| Channel | **Hard delete** (`channel.delete`) | channels.service.ts | 162 |
| ChannelPost | **Hard delete** (`channelPost.delete`) | channel-posts.service.ts | 42 |
| ForumThread | No delete endpoint | discord-features.service.ts | — |
| ForumReply | No delete endpoint | discord-features.service.ts | — |
| AudioRoom | Status change (`ended`) | audio-rooms.service.ts | 188 |
| Comment | Soft delete (`isRemoved: true`) at model level | posts.service.ts | — |
| ThreadReply | **Hard delete** | threads.service.ts | 715 |
| VideoComment | No delete endpoint | videos.service.ts | — |
| ReelComment | **Hard delete** | reels.service.ts | 517 |

**Problem:** Some content is soft-deleted (recoverable, still counts in database), some is hard-deleted (gone forever, cascades can orphan records). This is inconsistent:
- Videos are hard-deleted, but their comments, reactions, and bookmarks rely on cascade rules
- Thread replies are hard-deleted, but threads themselves are soft-deleted
- Reel comments are hard-deleted, but reels are soft-deleted
- Channel posts are hard-deleted with no counter adjustment for the channel

**Impact:** Hard-deleted videos may leave orphaned records if cascade rules are misconfigured. Soft-deleted content still occupies database space. No uniform audit trail for content removal.

---

## Finding 16: VIDEO DELETE DOES NOT DECREMENT commentsCount ON ASSOCIATED COMMENTS

**File:** `apps/api/src/modules/videos/videos.service.ts`
**Lines:** 345-369
**Severity:** LOW
**Category:** Orphaned counter state

When a video is hard-deleted (`video.delete`), the cascade should clean up VideoComment records. However, the `commentsCount` on the video is lost (the video is deleted). This is fine for the video itself, but if comments had nested replies, those relationships are cascade-deleted without any notification to the users who posted them.

---

## Finding 17: MONETIZATION sendTip CREATES COMPLETED TIP WITHOUT PAYMENT

**File:** `apps/api/src/modules/monetization/monetization.service.ts`
**Lines:** 21-62
**Severity:** CRITICAL
**Category:** Financial data integrity

```typescript
async sendTip(senderId: string, receiverId: string, amount: number, message?: string) {
    // ...
    const tip = await this.prisma.tip.create({
      data: {
        senderId,
        receiverId,
        amount,
        currency: 'USD',
        message,
        platformFee,
        status: 'completed',    // <-- Immediately marked as completed
      },
```

**Problem:** The tip is created with `status: 'completed'` without any payment processing. No Stripe charge, no balance check, no deduction from any account. The comment on line 59 says "Update user balance or stats (if we had a balance field) / For now, just return the tip" — confirming this is a stub.

**Note:** There IS a separate `payments.service.ts` that creates proper Stripe PaymentIntents with pending status, but the `monetization.service.ts` `sendTip` method bypasses all payment processing.

**Impact:** If the `monetization/tips` endpoint is exposed, anyone can create unlimited "completed" tips. These show up in tip statistics, top supporters lists, etc.

---

## Finding 18: ADMIN RESOLVE REPORT "REMOVE_CONTENT" DOES NOT ACTUALLY REMOVE CONTENT

**File:** `apps/api/src/modules/admin/admin.service.ts`
**Lines:** 95-126
**Severity:** HIGH
**Category:** Admin action not effectuated

```typescript
async resolveReport(adminId: string, reportId: string, action: string, note?: string) {
    await this.assertAdmin(adminId);
    // ...
    if (action === 'REMOVE_CONTENT') {
      status = 'RESOLVED';
      actionTaken = 'CONTENT_REMOVED';
    } else if (action === 'BAN_USER') {
      status = 'RESOLVED';
      actionTaken = 'PERMANENT_BAN';
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        actionTaken,
        reviewedById: adminId,
        reviewedAt: new Date(),
        moderatorNotes: note,
      },
    });
  }
```

**Problem:** When admin selects "REMOVE_CONTENT", the report is updated to say content was removed (`actionTaken: 'CONTENT_REMOVED'`), but the actual content (post, thread, reel, video) is NEVER modified. The content remains visible. Similarly, "BAN_USER" updates the report but does NOT call `banUser` — the user remains unbanned.

**Impact:** Admin moderation is purely cosmetic. Reported harmful content remains live even after admin "removes" it.

---

## Finding 19: DELETE ACCOUNT LEAVES ALL CONTENT VISIBLE

**File:** `apps/api/src/modules/users/users.service.ts`
**Lines:** 188-200
**Severity:** HIGH
**Category:** Orphaned content after account deletion

```typescript
async deleteAccount(userId: string) {
    // ...
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: `deleted_${userId.slice(0, 8)}`,
        displayName: 'Deleted User',
```

**Problem:** Account deletion only anonymizes the user record. All posts, threads, reels, videos, comments, stories, and messages created by this user remain fully visible and accessible. They now show "Deleted User" as the author but the content itself is not removed or hidden.

**Impact:** GDPR Right to Erasure violation — users expect their content to be removed when they delete their account. Content associated with deleted accounts clutters feeds and search results.

---

## Finding 20: STORY VIEW DEDUP HAS RACE CONDITION

**File:** `apps/api/src/modules/stories/stories.service.ts`
**Lines:** 205-224
**Severity:** LOW
**Category:** Race condition on view counting

```typescript
async markViewed(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    const alreadyViewed = await this.prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId } },
    });

    if (!alreadyViewed) {
      await this.prisma.$transaction([
        this.prisma.storyView.create({ data: { storyId, viewerId } }),
        this.prisma.story.update({
          where: { id: storyId },
          data: { viewsCount: { increment: 1 } },
        }),
      ]);
    }
```

**Problem:** The check-then-create pattern has a race window. Two concurrent calls for the same viewer+story can both pass the `findUnique` check (both see `null`), then both attempt the transaction. The second transaction would fail with P2002 on the unique constraint of StoryView — but this error is NOT caught. It would bubble up as a 500 error.

**Compare with:** The reel `view` method uses an interactive transaction with `findUnique` inside `$transaction(async (tx) => ...)`, which provides proper isolation.

**Fix:** Either catch P2002 in a try/catch, or use the interactive transaction pattern like reels.

---

## Finding 21: FOLLOW COUNTER DRIFT OVER TIME — NO RECONCILIATION

**File:** `apps/api/src/modules/follows/follows.service.ts`
**Severity:** MEDIUM
**Category:** Counter drift

The follow system correctly uses transactions for increment/decrement and GREATEST for clamping. However, there is no periodic reconciliation job to fix counter drift. Over time, edge cases (crashes mid-transaction, P2002 race conditions where the transaction partially commits on some databases) can cause `followersCount`/`followingCount` to drift from the actual count of Follow records.

**Evidence:** The `acceptRequest` method at line 314-338 catches P2002 and returns success, but when a P2002 occurs, the follow was already created by a concurrent request — which means that concurrent request ALSO incremented the counters. The current request's transaction was rolled back (so no double increment), but the return value doesn't indicate this. This is actually handled correctly. However, the block service (Finding 22) has a more problematic case.

---

## Finding 22: BLOCK FOLLOW CLEANUP — COUNTER DRIFT IF CONCURRENT UNFOLLOW

**File:** `apps/api/src/modules/blocks/blocks.service.ts`
**Lines:** 32-90
**Severity:** MEDIUM
**Category:** Counter sync race condition

```typescript
const deletedFollows = await this.prisma.follow.findMany({
  where: {
    OR: [
      { followerId: blockerId, followingId: blockedId },
      { followerId: blockedId, followingId: blockerId },
    ],
  },
  // ...
});

const blockerWasFollowing = deletedFollows.some(
  (f) => f.followerId === blockerId && f.followingId === blockedId,
);
// ... then in transaction:
this.prisma.follow.deleteMany({ ... }),
// ... conditionally decrement counters based on blockerWasFollowing
```

**Problem:** Between the `findMany` (to check which follows exist) and the `deleteMany` (inside the transaction), a concurrent `unfollow` could have already deleted the follow AND decremented the counter. The block transaction then also decrements the counter (because `blockerWasFollowing` was true based on the stale check), resulting in a double decrement.

**Impact:** Follow counters could go negative despite GREATEST clamping (if the concurrent unfollow also used GREATEST, the minimum is 0, but the count is still wrong — it should be 1 less than it actually is).

---

## Finding 23: CHALLENGE leaveChallenge MISSING — participantCount NEVER DECREMENTED

**File:** `apps/api/src/modules/gamification/gamification.service.ts`
**Severity:** MEDIUM
**Category:** Missing decrement operation

The `joinChallenge` method (line 314-337) increments `participantCount`. However, there is NO `leaveChallenge` or `unjoinChallenge` method. Once a user joins a challenge, they cannot leave, and the count can never go down.

**Impact:** `participantCount` is monotonically increasing. Users who accidentally join cannot unjoin.

---

## Finding 24: SERIES episodeCount NEVER DECREMENTED

**File:** `apps/api/src/modules/gamification/gamification.service.ts`
**Lines:** 406-435
**Severity:** LOW
**Category:** Missing decrement on delete

The `addEpisode` method increments `episodeCount` on the series. There is no `removeEpisode` method. If episodes are deleted via cascade or admin action, the `episodeCount` becomes permanently inflated.

---

## Finding 25: POST COMMENT DELETE DOES NOT DECREMENT commentsCount

**File:** `apps/api/src/modules/posts/posts.service.ts`
**Severity:** HIGH
**Category:** Missing counter decrement

Looking at `addComment` (line 792-849), the `commentsCount` is incremented:
```typescript
this.prisma.post.update({
  where: { id: postId },
  data: { commentsCount: { increment: 1 } },
}),
```

However, there is no `deleteComment` method in `posts.service.ts` that decrements `commentsCount`. While comments can be soft-deleted (Comment model has `isRemoved`), the `commentsCount` on the Post is never decremented.

**Compare with:** The `reels.service.ts` `deleteComment` method at line 503-521 correctly decrements `commentsCount`. The `videos.service.ts` has a `comment` method that increments but also no `deleteComment` that decrements.

**Impact:** Post `commentsCount` only goes up, never down. Deleted comments still contribute to the displayed count.

---

## Finding 26: VIDEO COMMENT DELETE NOT IMPLEMENTED — commentsCount ONLY GOES UP

**File:** `apps/api/src/modules/videos/videos.service.ts`
**Severity:** MEDIUM
**Category:** Missing functionality

The `comment` method (line 490-534) increments `commentsCount`, but there is no `deleteComment` method for videos at all. Comments can be created but never deleted, and `commentsCount` can never decrease.

---

## Finding 27: PREMIERE REMINDER ADD/REMOVE NOT IN TRANSACTION

**File:** `apps/api/src/modules/videos/videos.service.ts`
**Lines:** 781-800
**Severity:** LOW
**Category:** Non-atomic counter update

```typescript
async setPremiereReminder(videoId: string, userId: string) {
    // ...
    await this.prisma.premiereReminder.create({
      data: { premiereId: premiere.id, userId },
    });
    await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = "reminderCount" + 1 WHERE id = ${premiere.id}`;
    return { success: true };
  }
```

**Problem:** The `create` and the counter increment are NOT in a transaction. If the `create` succeeds but the `$executeRaw` fails, the reminder exists but the count is wrong. If the `create` fails with P2002 (duplicate), the counter is never incremented (correct), but the P2002 is not caught so it returns a 500 error.

---

## Finding 28: FORUM THREAD replyToForumThread NOT IN TRANSACTION

**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 45-61
**Severity:** LOW
**Category:** Non-atomic counter update

```typescript
async replyToForumThread(userId: string, threadId: string, content: string) {
    // ...
    const reply = await this.prisma.forumReply.create({
      data: { threadId, authorId: userId, content },
      include: { author: { select: USER_SELECT } },
    });

    await this.prisma.forumThread.update({
      where: { id: threadId },
      data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
    });
```

**Problem:** The reply creation and the `replyCount` increment are NOT in a transaction. If the reply is created but the update fails, the count is wrong.

---

## Finding 29: HASHTAG decrementCount SILENTLY SWALLOWS ERRORS

**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`
**Lines:** 311-319
**Severity:** LOW
**Category:** Silent data loss

```typescript
async decrementCount(name: string, field: 'postsCount' | 'reelsCount' | 'threadsCount' | 'videosCount') {
    await this.prisma.hashtag.update({
      where: { name },
      data: { [field]: { decrement: 1 } },
    }).catch(() => {
      this.logger.warn(`Failed to decrement ${field} for hashtag ${name}`);
    });
  }
```

**Problem:** The decrement uses Prisma's `decrement` which can go negative (no GREATEST). Also, even though this method exists, it is NOT called from any delete operation (as documented in Findings 11-13).

---

## Finding 30: DUAL BALANCE SYSTEMS — CoinBalance vs User.coinBalance

**Severity:** CRITICAL
**Category:** Data model inconsistency

The gift system uses `CoinBalance` model (via `gifts.service.ts`):
```typescript
this.prisma.coinBalance.upsert({ where: { userId }, ... })
```

However, the Prisma schema also has `coinBalance` as a direct field on the `User` model (from the payments/premium system). These are TWO SEPARATE balance tracking systems:
1. `CoinBalance` table — used by gifts.service.ts for coins and diamonds
2. `User.coinBalance` field — potentially used by other services

**Impact:** If any code reads `user.coinBalance` expecting the gift system's balance, it gets a different value. This is a source of phantom bugs.

---

## Finding 31: POST SHARE DOES NOT CHECK IF ORIGINAL POST'S USER IS BLOCKED

**File:** `apps/api/src/modules/posts/posts.service.ts`
**Lines:** 709-735
**Severity:** MEDIUM
**Category:** Block bypass via sharing

```typescript
async share(postId: string, userId: string, content?: string) {
    const original = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!original || original.isRemoved) throw new NotFoundException('Post not found');
```

**Problem:** No block check. A user who has been blocked by the post author can still share their post, creating a new post that references the blocked user's content. This bypasses the block intention.

---

## Finding 32: THREAD REPOST CREATES THREAD WITHOUT isChainHead FLAG

**File:** `apps/api/src/modules/threads/threads.service.ts`
**Lines:** 530-546
**Severity:** LOW
**Category:** Data inconsistency

```typescript
const [repost] = await this.prisma.$transaction([
  this.prisma.thread.create({
    data: {
      userId,
      content: '',
      repostOfId: threadId,
      mediaUrls: [],
      mediaTypes: [],
      visibility: 'PUBLIC',
      // NOTE: isChainHead is not set — defaults to model default
    },
```

**Problem:** Reposts are created without explicitly setting `isChainHead`. If the schema default is `false`, reposts won't appear in feeds that filter by `isChainHead: true`. If the default is `true`, they will appear. This should be explicitly set.

---

## Finding 33: THREAD REPOST DOES NOT INCREMENT threadsCount ON USER

**File:** `apps/api/src/modules/threads/threads.service.ts`
**Lines:** 530-546
**Severity:** LOW
**Category:** Missing counter increment

The regular `create` method at line 344-380 increments `user.threadsCount`. But the `repost` method creates a new Thread record without incrementing `user.threadsCount`. This means the user's thread count underreports their actual thread count if they have reposts.

---

## Finding 34: REEL MODERATION REFERENCES NON-EXISTENT FIELD

**File:** `apps/api/src/modules/reels/reels.service.ts`
**Lines:** 160-161
**Severity:** MEDIUM
**Category:** Dead code / field mismatch

```typescript
if (reel.description) {
  this.queueService.addModerationJob({ content: reel.description, contentType: 'reel', contentId: reel.id }).catch(() => {});
}
```

**Problem:** The REEL_SELECT at line 22-57 does not include a `description` field — reels have `caption`, not `description`. The `reel.description` will always be `undefined`, so the moderation job is NEVER queued for reel text content.

**Impact:** Reel captions are never moderated for text content. Only thumbnail image moderation fires.

---

## Finding 35: POST REACTION TYPE CHANGE DOES NOT ADJUST likesCount

**File:** `apps/api/src/modules/posts/posts.service.ts`
**Lines:** 614-661
**Severity:** LOW
**Category:** Counter desync on reaction change

```typescript
async react(postId: string, userId: string, reaction: string = 'LIKE') {
    // ...
    if (existing) {
      // Update reaction type
      await this.prisma.postReaction.update({
        where: { userId_postId: { userId, postId } },
        data: { reaction: reaction as ReactionType },
      });
    } else {
      // NEW reaction — increment likesCount
      await this.prisma.$transaction([
        this.prisma.postReaction.create({ ... }),
        this.prisma.post.update({ data: { likesCount: { increment: 1 } } }),
      ]);
```

**Problem:** When a user changes their reaction (e.g., from LIKE to LOVE), the reaction record is updated but `likesCount` is NOT re-evaluated. The field is called `likesCount` but tracks all reaction types. This is correct IF `likesCount` means "total reactions" — but the name is misleading. If it's meant to be specifically "LIKE" reactions, then changing from LIKE to LOVE should decrement, and changing to LIKE should increment.

---

## Finding 36: LIVE SESSION join CAN BE CALLED REPEATEDLY FOR VIEW INFLATION

**File:** `apps/api/src/modules/live/live.service.ts`
**Lines:** 109-146
**Severity:** MEDIUM
**Category:** View counter inflation

```typescript
async join(sessionId: string, userId: string, role = 'viewer') {
    // ...
    if (existing && !existing.leftAt) return { joined: true, currentViewers: session.currentViewers };

    if (existing) {
      // Re-joining after leaving
      await this.prisma.liveParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { leftAt: null, joinedAt: new Date(), role },
      });
    } else {
      await this.prisma.liveParticipant.create({ ... });
    }

    await this.prisma.$executeRaw`
      UPDATE "LiveSession"
      SET "currentViewers" = "currentViewers" + 1,
          "totalViews" = "totalViews" + 1,
          ...
    `;
```

**Problem:** When a user re-joins (the `existing` case with `leftAt` set), both `currentViewers` AND `totalViews` are incremented. The `totalViews` should probably only increment on first join, not on re-joins. A user can join → leave → join → leave repeatedly to inflate `totalViews`.

**Impact:** Live session `totalViews` is inflatable by toggling join/leave.

---

## Finding 37: COMMERCE ORDER CANCELLATION DOES NOT RESTORE salesCount

**File:** `apps/api/src/modules/commerce/commerce.service.ts`
**Lines:** 141-170
**Severity:** MEDIUM
**Category:** Counter not reversed on cancellation

```typescript
async updateOrderStatus(orderId: string, sellerId: string, status: string) {
    // ...
    if ((status === 'cancelled' || status === 'refunded') && order.status !== 'cancelled' && order.status !== 'refunded') {
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { stock: { increment: order.quantity } },
      });
    }
```

**Problem:** On cancellation/refund, `stock` is restored but `salesCount` is NOT decremented. The `createOrder` method at line 97-122 increments both `stock: { decrement: qty }` and `salesCount: { increment: qty }`, but cancellation only restores stock.

**Impact:** `salesCount` is permanently inflated by cancelled/refunded orders.

---

## Finding 38: BOOKMARK saveThread DOES NOT INCREMENT bookmarksCount

**File:** `apps/api/src/modules/bookmarks/bookmarks.service.ts`
**Lines:** 96-117
**Severity:** LOW
**Category:** Missing counter increment

```typescript
async saveThread(userId: string, threadId: string) {
    // ...
    try {
      return await this.prisma.threadBookmark.create({
        data: { userId, threadId },
      });
```

**Problem:** Unlike `savePost` (which increments `savesCount`) and `saveVideo` (which increments `savesCount`), the `saveThread` method creates a ThreadBookmark but does NOT increment `bookmarksCount` on the Thread. Similarly, `unsaveThread` does not decrement.

**Compare with:** The `threads.service.ts` `bookmark` method at line 571-589 DOES increment `bookmarksCount`. So if both code paths exist, only one maintains the counter.

---

## Finding 39: GAMIFICATION STREAK longestDays UPDATE NOT ATOMIC

**File:** `apps/api/src/modules/gamification/gamification.service.ts`
**Lines:** 79-93
**Severity:** LOW
**Category:** Non-atomic update

```typescript
const updated = await this.prisma.userStreak.update({
  where: { userId_streakType: { userId, streakType } },
  data: {
    currentDays: { increment: 1 },
    lastActiveDate: today,
  },
});

// Update longestDays if needed
if (updated.currentDays > updated.longestDays) {
  await this.prisma.userStreak.update({
    where: { userId_streakType: { userId, streakType } },
    data: { longestDays: updated.currentDays },
  });
}
```

**Problem:** The `longestDays` update is a separate query, not atomic. Two concurrent calls could both increment `currentDays` and both see it exceeds `longestDays`, but that's actually fine since both would set the same value. The real issue is minor — under extreme concurrency, the second update might set `longestDays` to a value that's already been superseded.

---

## Finding 40: XP LEVEL CALCULATION NOT ATOMIC WITH XP INCREMENT

**File:** `apps/api/src/modules/gamification/gamification.service.ts`
**Lines:** 128-153
**Severity:** LOW
**Category:** Non-atomic read-modify-write

```typescript
const xp = await this.prisma.userXP.upsert({
  where: { userId },
  create: { userId, totalXP: amount, level: getLevelForXP(amount) },
  update: { totalXP: { increment: amount } },
});

const newLevel = getLevelForXP(xp.totalXP);
if (newLevel !== xp.level) {
  await this.prisma.userXP.update({
    where: { userId },
    data: { level: newLevel },
  });
}
```

**Problem:** Between the upsert (which atomically increments totalXP) and the level update, another concurrent XP award could further increment totalXP. The level calculation would use a stale totalXP value. However, since level is recalculated on every awardXP call, it would self-correct on the next call. This is a minor inconsistency window.

---

## Summary of Critical Findings

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | Video views infinitely inflatable (no dedup) | HIGH | Counter inflation |
| 2 | Gift sendGift double-spend race condition | CRITICAL | Race condition |
| 3 | Coin balance can go negative | CRITICAL | Counter not clamped |
| 4 | purchaseCoins gives free coins without payment | CRITICAL | Free money |
| 5 | Poll vote/totalVotes not clamped | MEDIUM | Counter not clamped |
| 6 | Community membersCount not clamped | MEDIUM | Counter not clamped |
| 7 | Series followersCount not clamped | MEDIUM | Counter not clamped |
| 8 | Channel post likes infinitely inflatable | HIGH | Counter inflation |
| 9 | Channel post unlike without verifying like exists | HIGH | Counter manipulation |
| 10 | Dual bookmark code paths for videos | MEDIUM | Code duplication |
| 11 | Thread delete doesn't decrement hashtag counts | MEDIUM | Counter desync |
| 12 | Post delete doesn't decrement hashtag counts | MEDIUM | Counter desync |
| 13 | Reel delete doesn't decrement hashtag counts | MEDIUM | Counter desync |
| 14 | Reel creation increments wrong hashtag counter | MEDIUM | Wrong field |
| 15 | Soft vs hard delete inconsistency | MEDIUM | Inconsistent strategy |
| 16 | Video delete orphan implications | LOW | Orphaned data |
| 17 | Tips created as completed without payment | CRITICAL | Financial integrity |
| 18 | Admin REMOVE_CONTENT doesn't remove content | HIGH | Admin ineffective |
| 19 | Delete account leaves all content visible | HIGH | GDPR violation |
| 20 | Story view dedup race condition | LOW | Race condition |
| 21 | Follow counter drift without reconciliation | MEDIUM | Counter drift |
| 22 | Block follow cleanup race condition | MEDIUM | Race condition |
| 23 | Challenge has no leave — participantCount monotonic | MEDIUM | Missing feature |
| 24 | Series episodeCount never decremented | LOW | Missing decrement |
| 25 | Post comment delete missing — commentsCount monotonic | HIGH | Missing decrement |
| 26 | Video comment delete not implemented | MEDIUM | Missing feature |
| 27 | Premiere reminder counter not in transaction | LOW | Non-atomic |
| 28 | Forum reply counter not in transaction | LOW | Non-atomic |
| 29 | Hashtag decrement can go negative | LOW | Counter not clamped |
| 30 | Dual coin balance systems | CRITICAL | Data model conflict |
| 31 | Post share bypasses block check | MEDIUM | Block bypass |
| 32 | Thread repost missing isChainHead | LOW | Data inconsistency |
| 33 | Thread repost missing threadsCount increment | LOW | Missing increment |
| 34 | Reel moderation references non-existent field | MEDIUM | Dead code |
| 35 | Post reaction change doesn't adjust count | LOW | Counter semantics |
| 36 | Live session join inflates totalViews on re-join | MEDIUM | Counter inflation |
| 37 | Order cancellation doesn't restore salesCount | MEDIUM | Missing decrement |
| 38 | Bookmark saveThread missing counter increment | LOW | Missing increment |
| 39 | Streak longestDays update not atomic | LOW | Non-atomic |
| 40 | XP level calculation not atomic | LOW | Non-atomic |

**Total findings: 40**
- CRITICAL: 5
- HIGH: 6
- MEDIUM: 18
- LOW: 11
