# Reels Feed Engagement Scoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace chronological reels feed with TikTok‑style engagement‑scored feed (Batch 17 Step 6).

**Architecture:** Modify `getFeed` in `reels.service.ts` to fetch recent reels (72 h), compute engagement score `(likes×2 + comments×4 + shares×6 + views×0.1) / ageHours^1.2`, sort by score, paginate with `createdAt` cursor. Keep existing Redis cache (30 s) and block/mute filtering.

**Tech Stack:** NestJS, Prisma, Redis, TypeScript, Jest.

---

### Task 1: Update the getFeed test to expect engagement scoring

**Files:**
- Modify: `apps/api/src/modules/reels/reels.service.spec.ts:193‑326` (the two existing `getFeed` tests)

**Step 1: Write the failing test**

Replace the test “should return READY reels, exclude PROCESSING/FAILED” (lines 194‑272) with a test that verifies reels are ordered by engagement score, not `createdAt`.

```typescript
it('should return reels ordered by engagement score, not chronology', async () => {
  const userId = 'user-123';
  const now = new Date();
  const mockReels = [
    {
      id: 'reel-1',
      status: ReelStatus.READY,
      userId: 'user-1',
      user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
      videoUrl: 'url1',
      thumbnailUrl: 'thumb1',
      duration: 10,
      caption: 'Older but high engagement',
      mentions: [],
      hashtags: [],
      audioTrackId: null,
      isDuet: false,
      isStitch: false,
      isRemoved: false,
      likesCount: 100,      // high engagement
      commentsCount: 20,
      sharesCount: 10,
      savesCount: 0,
      viewsCount: 5000,
      loopsCount: 10,
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day old
      updatedAt: new Date(),
      audioTrack: null,
    },
    {
      id: 'reel-2',
      status: ReelStatus.READY,
      userId: 'user-2',
      user: { id: 'user-2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: false },
      videoUrl: 'url2',
      thumbnailUrl: 'thumb2',
      duration: 12,
      caption: 'Newer but low engagement',
      mentions: [],
      hashtags: [],
      audioTrackId: null,
      isDuet: false,
      isStitch: false,
      isRemoved: false,
      likesCount: 5,
      commentsCount: 1,
      sharesCount: 0,
      savesCount: 0,
      viewsCount: 100,
      loopsCount: 5,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours old
      updatedAt: new Date(),
      audioTrack: null,
    },
  ];

  prisma.block.findMany.mockResolvedValue([]);
  prisma.mute.findMany.mockResolvedValue([]);
  // The service will fetch up to 200 reels; we mock returning these two
  prisma.reel.findMany.mockResolvedValue(mockReels);
  prisma.reelReaction.findMany.mockResolvedValue([]);
  prisma.reelInteraction.findMany.mockResolvedValue([]);

  const result = await service.getFeed(userId);

  // Expect the high‑engagement older reel first, not the newer low‑engagement one
  expect(result.data[0].id).toBe('reel-1'); // older, high engagement
  expect(result.data[1].id).toBe('reel-2'); // newer, low engagement
  // Verify the query fetched recent reels (72h window) and did NOT use createdAt order
  expect(prisma.reel.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      orderBy: undefined, // No orderBy because scoring happens in‑memory
      take: 200,          // We fetch up to 200 to score
    })
  );
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npx jest src/modules/reels/reels.service.spec.ts -t "should return reels ordered by engagement score"
```
Expected: FAIL with `Expected: "reel-1"`, `Received: "reel-2"` (because current implementation orders by `createdAt DESC`).

**Step 3: Commit**
```bash
git add apps/api/src/modules/reels/reels.service.spec.ts
git commit -m "test: expect engagement‑scored ordering for reels feed"
```

---

### Task 2: Implement engagement scoring in getFeed

**Files:**
- Modify: `apps/api/src/modules/reels/reels.service.ts:125‑198` (the `getFeed` method)

**Step 1: Write minimal implementation**

Replace the existing `getFeed` method (lines 125‑198) with the following. **Keep the exact same signature, cache keys, block/mute filtering, liked/bookmarked enhancement, and Redis caching logic.** Only change the query and ranking logic.

```typescript
async getFeed(userId: string | undefined, cursor?: string, limit = 20) {
  // Cache for 30 seconds if user is logged in
  if (userId) {
    const cacheKey = `feed:reels:${userId}:${cursor ?? 'first'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const [blocks, mutes] = userId ? await Promise.all([
    this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    this.prisma.mute.findMany({ where: { userId: userId }, select: { mutedId: true } }),
  ]) : [[], []];

  const excludedIds = [
    ...blocks.map(b => b.blockedId),
    ...mutes.map(m => m.mutedId),
  ];

  const where: Prisma.ReelWhereInput = {
    status: ReelStatus.READY,
    isRemoved: false,
    user: { isPrivate: false },
    createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }, // last 72h
    ...(cursor ? { createdAt: { lt: new Date(cursor), gte: new Date(Date.now() - 72 * 60 * 60 * 1000) } } : {}),
    ...(excludedIds.length ? { userId: { notIn: excludedIds } } : {}),
  };

  // Fetch up to 200 recent reels to score and rank
  const recentReels = await this.prisma.reel.findMany({
    where,
    select: REEL_SELECT,
    take: 200,
    orderBy: { createdAt: 'desc' }, // initial fetch by recency, will be re‑ordered by score
  });

  // Score each reel: engagement weighted by recency
  const scored = recentReels.map(reel => {
    const ageHours = Math.max(1, (Date.now() - new Date(reel.createdAt).getTime()) / 3600000);
    const engagement = (reel.likesCount * 2) + (reel.commentsCount * 4) + (reel.sharesCount * 6) + (reel.viewsCount * 0.1);
    const score = engagement / Math.pow(ageHours, 1.2); // slower decay than posts/threads
    return { ...reel, _score: score };
  });

  // Sort by score descending
  scored.sort((a, b) => b._score - a._score);

  // Paginate using createdAt as cursor (same pattern as step 4)
  const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
  const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);

  const hasMore = page.length > limit;
  const data = hasMore ? page.slice(0, limit) : page;

  // Strip internal _score field
  const plainData = data.map(({ _score, ...reel }) => reel);

  let likedReelIds: string[] = [];
  let bookmarkedReelIds: string[] = [];

  if (userId && plainData.length > 0) {
    const reelIds = plainData.map(r => r.id);
    const [reactions, interactions] = await Promise.all([
      this.prisma.reelReaction.findMany({
        where: { userId, reelId: { in: reelIds } },
        select: { reelId: true },
      }),
      this.prisma.reelInteraction.findMany({
        where: { userId, reelId: { in: reelIds }, saved: true },
        select: { reelId: true },
      }),
    ]);
    likedReelIds = reactions.map(r => r.reelId);
    bookmarkedReelIds = interactions.map(i => i.reelId);
  }

  const enhancedData = plainData.map(reel => ({
    ...reel,
    isLiked: userId ? likedReelIds.includes(reel.id) : false,
    isBookmarked: userId ? bookmarkedReelIds.includes(reel.id) : false,
  }));

  const result = {
    data: enhancedData,
    meta: {
      cursor: hasMore ? enhancedData[enhancedData.length - 1].createdAt : null,
      hasMore,
    },
  };

  if (userId) {
    const cacheKey = `feed:reels:${userId}:${cursor ?? 'first'}`;
    await this.redis.setex(cacheKey, 30, JSON.stringify(result));
  }

  return result;
}
```

**Step 2: Run the updated test to verify it passes**

Run:
```bash
cd apps/api && npx jest src/modules/reels/reels.service.spec.ts -t "should return reels ordered by engagement score"
```
Expected: PASS.

**Step 3: Run all reels service tests**

Run:
```bash
cd apps/api && npx jest src/modules/reels/reels.service.spec.ts
```
Expected: All tests pass (the other `getFeed` test about block/mute filtering may need adjustment because it expects `orderBy: { createdAt: 'desc' }`. Update that expectation to `orderBy: undefined` or remove the `orderBy` check.)

**Step 4: Commit**
```bash
git add apps/api/src/modules/reels/reels.service.ts
git commit -m "feat: engagement‑scored reels feed (Batch 17 Step 6)"
```

---

### Task 3: Verify TypeScript compilation

**Files:**
- Check: `apps/api/`

**Step 1: Run TypeScript compiler**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: 0 errors.

**Step 2: Commit if clean**
```bash
git add -A
git commit -m "chore: reels engagement scoring compiles cleanly"
```

---

### Task 4: Update the block/mute test expectation

**Files:**
- Modify: `apps/api/src/modules/reels/reels.service.spec.ts:274‑326` (the “should exclude blocked/muted users” test)

**Step 1: Adjust test expectation**

The test currently expects `orderBy: { createdAt: 'desc' }`. Change it to expect `orderBy: undefined` (or remove the `orderBy` check entirely) because the new implementation does not order at the database level.

Find the assertion around line 323 and replace:
```typescript
expect(prisma.reel.findMany).toHaveBeenCalledWith({
  where: { ... },
  select: REEL_SELECT,
  take: 21,
  orderBy: { createdAt: 'desc' },
});
```
with:
```typescript
expect(prisma.reel.findMany).toHaveBeenCalledWith({
  where: { ... },
  select: REEL_SELECT,
  take: 200, // now we fetch up to 200 for scoring
});
```

**Step 2: Run the test**

```bash
cd apps/api && npx jest src/modules/reels/reels.service.spec.ts -t "should exclude blocked/muted users"
```
Expected: PASS.

**Step 3: Commit**
```bash
git add apps/api/src/modules/reels/reels.service.spec.ts
git commit -m "test: adjust block/mute test for engagement scoring"
```

---

### Task 5: Final verification

**Step 1: Run all API tests**

```bash
cd apps/api && npx jest
```
Expected: All tests pass.

**Step 2: Ensure no lint errors (optional)**

```bash
cd apps/api && npm run lint
```
(If lint script exists.)

**Step 3: Commit final state**

```bash
git add -A
git commit -m "chore: reels engagement scoring complete"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2026-03-08-reels-engagement-implementation.md`.

**Two execution options:**

**1. Subagent‑Driven (this session)** – I dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** – Open new session with executing‑plans, batch execution with checkpoints.

**Which approach?**