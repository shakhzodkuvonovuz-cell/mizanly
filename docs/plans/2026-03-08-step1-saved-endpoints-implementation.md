# Step 1: Backend Saved Reels/Videos Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `getSavedReels` and `getSavedVideos` backend endpoints for the Saved screen expansion.

**Architecture:** Add two new methods to UsersService querying `ReelInteraction.saved=true` and `VideoBookmark`, with corresponding controller endpoints returning paginated responses. Follow existing `getSavedPosts`/`getSavedThreads` patterns exactly.

**Tech Stack:** NestJS 10, Prisma, TypeScript, Jest

---

## ANALYSIS FINDINGS (Task 1 Completed)

### 1. Existing Pagination Pattern
**From `apps/api/src/modules/users/users.service.ts:264-328`:**
- `getSavedPosts`: Uses `SavedPost` model with cursor: `{ userId_postId: { userId, postId: cursor } }` (line 283)
- `getSavedThreads`: Uses `ThreadBookmark` with cursor: `{ userId_threadId: { userId, threadId: cursor } }` (line 315)
- Both return: `{ data: items.map((x) => x.post/thread), meta: { cursor, hasMore } }`
- Both have: `take: limit + 1`, `orderBy: { createdAt: 'desc' }`

### 2. Prisma Schema Constraints
**Existing Models:**
- `SavedPost`: `@@id([userId, postId])` (line 859) - composite primary key
- `ThreadBookmark`: `@@id([userId, threadId])` (line 1319) - composite primary key

**New Models:**
- `ReelInteraction`: `@@unique([userId, reelId])` (line 1654) - unique constraint, has separate `id` field
- `VideoBookmark`: `@@id([userId, videoId])` (line 1330) - composite primary key

### 3. Key Discovery: `@@id` vs `@@unique`
- **Both work with same cursor syntax**: `{ userId_XId: { userId, XId: cursor } }`
- **Evidence**: Existing `getSavedPosts` (`@@id`) and `getSavedThreads` (`@@id`) both work
- **Prisma handles both the same way** for cursor pagination

### 4. Method Signature Pattern
Both existing methods have: `async getSavedX(userId: string, cursor?: string, limit = 20)`

### 5. Implementation Implications
1. **ReelInteraction**: Needs `saved: true` filter (has `saved Boolean @default(false)` field)
2. **VideoBookmark**: No `saved` filter needed (all records are bookmarks)
3. **Cursor syntax**: Follows `userId_{modelName}Id` pattern for both constraint types

---



### Task 1: Read Existing Saved Methods

**Files:**
- Read: `apps/api/src/modules/users/users.service.ts:264-328` (getSavedPosts, getSavedThreads)
- Read: `apps/api/src/modules/users/users.controller.ts:65-85` (saved endpoints)

**Step 1: Examine pagination pattern**
Open both files and note:
1. `getSavedPosts` uses `SavedPost` model with cursor: `{ userId_postId: { userId, postId: cursor } }`
2. `getSavedThreads` uses `ThreadBookmark` with cursor: `{ userId_threadId: { userId, threadId: cursor } }`
3. Both return `{ data: items.map((x) => x.post/thread), meta: { cursor, hasMore } }`
4. Both have `take: limit + 1`, `orderBy: { createdAt: 'desc' }`

**Step 2: Check Prisma schema for constraints**
Run: `grep -n "@@id\|@@unique" apps/api/prisma/schema.prisma | grep -A1 -B1 "ReelInteraction\|VideoBookmark"`
Expected output shows constraints for cursor logic.

**Step 3: Note method signatures**
Both methods have: `async getSavedX(userId: string, cursor?: string, limit = 20)`

**Step 4: Commit**
```bash
git add docs/plans/2026-03-08-step1-saved-endpoints-implementation.md
git commit -m "docs: add implementation plan for saved endpoints"
```

---

### Task 2: Add getSavedReels Method

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts` (after getSavedThreads, around line 330)
- Test: Create failing test first

**Step 1: Write failing test in users.service.spec.ts**
Find existing tests for saved methods. Add after `getSavedThreads` tests:
```typescript
describe('getSavedReels', () => {
  it('should return bookmarked reels', async () => {
    const mockInteractions = [
      {
        id: 'int1',
        createdAt: new Date('2026-03-08T10:00:00Z'),
        reel: {
          id: 'r1',
          videoUrl: 'https://cdn.mizanly.com/reels/r1.mp4',
          thumbnailUrl: 'https://cdn.mizanly.com/reels/r1.jpg',
          caption: 'Test reel',
          likesCount: 100,
          commentsCount: 20,
          sharesCount: 5,
          viewsCount: 1000,
          createdAt: new Date('2026-03-07T10:00:00Z'),
          user: {
            id: 'u2',
            username: 'testuser',
            displayName: 'Test User',
            avatarUrl: 'https://cdn.mizanly.com/avatars/u2.jpg',
            isVerified: true
          }
        }
      }
    ];
    mockPrisma.reelInteraction.findMany.mockResolvedValue(mockInteractions);

    const result = await service.getSavedReels('u1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('r1');
    expect(result.data[0].isBookmarked).toBe(true);
    expect(result.meta.hasMore).toBe(false);
    expect(mockPrisma.reelInteraction.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', saved: true },
      include: expect.objectContaining({ reel: expect.any(Object) }),
      take: 21,
      orderBy: { createdAt: 'desc' }
    });
  });
});
```

**Step 2: Run test to verify it fails**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedReels"`
Expected: FAIL with "service.getSavedReels is not a function"

**Step 3: Add mock to test setup**
Before running test, ensure mock exists. Check if `reelInteraction` is in mockPrisma. If not, add to mock setup:
```typescript
reelInteraction: { findMany: jest.fn() },
```

**Step 4: Run test again with mock**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedReels"`
Expected: FAIL with "service.getSavedReels is not a function" (method not implemented)

**Step 5: Implement getSavedReels method**
Add after `getSavedThreads` method in users.service.ts:
```typescript
  async getSavedReels(userId: string, cursor?: string, limit = 20) {
    const interactions = await this.prisma.reelInteraction.findMany({
      where: { userId, saved: true },
      include: {
        reel: {
          select: {
            id: true,
            videoUrl: true,
            thumbnailUrl: true,
            caption: true,
            likesCount: true,
            commentsCount: true,
            sharesCount: true,
            viewsCount: true,
            createdAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_reelId: { userId, reelId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = interactions.length > limit;
    const items = hasMore ? interactions.slice(0, limit) : interactions;
    return {
      data: items.map((i: any) => ({ ...i.reel, isBookmarked: true })),
      meta: {
        cursor: hasMore ? items[items.length - 1].reelId : null,
        hasMore,
      },
    };
  }
```

**Step 6: Run test to verify it passes**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedReels"`
Expected: PASS

**Step 7: Add cursor pagination test**
Add second test for pagination:
```typescript
  it('should paginate with cursor', async () => {
    const mockInteractions = Array.from({ length: 21 }, (_, i) => ({
      id: `int${i}`,
      createdAt: new Date(`2026-03-08T10:00:${i.toString().padStart(2, '0')}Z`),
      reelId: `r${i}`,
      reel: {
        id: `r${i}`,
        videoUrl: `https://cdn.mizanly.com/reels/r${i}.mp4`,
        thumbnailUrl: `https://cdn.mizanly.com/reels/r${i}.jpg`,
        caption: `Reel ${i}`,
        likesCount: 100,
        commentsCount: 20,
        sharesCount: 5,
        viewsCount: 1000,
        createdAt: new Date(`2026-03-07T10:00:${i.toString().padStart(2, '0')}Z`),
        user: { id: 'u2', username: 'testuser', displayName: 'Test User', avatarUrl: 'avatar.jpg', isVerified: true }
      }
    }));
    mockPrisma.reelInteraction.findMany.mockResolvedValue(mockInteractions);

    const result = await service.getSavedReels('u1', 'r19');

    expect(result.data).toHaveLength(20);
    expect(result.data[0].id).toBe('r0');
    expect(result.data[19].id).toBe('r19');
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.cursor).toBe('r19');
    expect(mockPrisma.reelInteraction.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', saved: true },
      include: expect.any(Object),
      take: 21,
      cursor: { userId_reelId: { userId: 'u1', reelId: 'r19' } },
      skip: 1,
      orderBy: { createdAt: 'desc' }
    });
  });
```

**Step 8: Run pagination test**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "should paginate with cursor"`
Expected: PASS

**Step 9: Commit**
```bash
git add apps/api/src/modules/users/users.service.ts apps/api/src/modules/users/users.service.spec.ts
git commit -m "feat: add getSavedReels method with tests"
```

---

### Task 3: Add getSavedVideos Method

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts` (after getSavedReels)
- Test: Add tests to users.service.spec.ts

**Step 1: Write failing test for getSavedVideos**
Add after getSavedReels tests:
```typescript
describe('getSavedVideos', () => {
  it('should return bookmarked videos', async () => {
    const mockBookmarks = [
      {
        createdAt: new Date('2026-03-08T10:00:00Z'),
        video: {
          id: 'v1',
          title: 'Test Video',
          thumbnailUrl: 'https://cdn.mizanly.com/videos/v1.jpg',
          duration: 300,
          viewsCount: 5000,
          likesCount: 200,
          createdAt: new Date('2026-03-07T10:00:00Z'),
          channel: {
            id: 'ch1',
            handle: 'testchannel',
            name: 'Test Channel',
            avatarUrl: 'https://cdn.mizanly.com/channels/ch1.jpg'
          }
        }
      }
    ];
    mockPrisma.videoBookmark.findMany.mockResolvedValue(mockBookmarks);

    const result = await service.getSavedVideos('u1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('v1');
    expect(result.data[0].isBookmarked).toBe(true);
    expect(result.meta.hasMore).toBe(false);
    expect(mockPrisma.videoBookmark.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: expect.objectContaining({ video: expect.any(Object) }),
      take: 21,
      orderBy: { createdAt: 'desc' }
    });
  });
});
```

**Step 2: Run test to verify it fails**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedVideos"`
Expected: FAIL with "service.getSavedVideos is not a function"

**Step 3: Ensure videoBookmark mock exists**
Check if `videoBookmark` is in mockPrisma. If not, add:
```typescript
videoBookmark: { findMany: jest.fn() },
```

**Step 4: Run test again**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedVideos"`
Expected: FAIL with "service.getSavedVideos is not a function"

**Step 5: Implement getSavedVideos method**
Add after `getSavedReels` method:
```typescript
  async getSavedVideos(userId: string, cursor?: string, limit = 20) {
    const bookmarks = await this.prisma.videoBookmark.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
            viewsCount: true,
            likesCount: true,
            createdAt: true,
            channel: { select: { id: true, handle: true, name: true, avatarUrl: true } },
          },
        },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_videoId: { userId, videoId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    return {
      data: items.map((b: any) => ({ ...b.video, isBookmarked: true })),
      meta: {
        cursor: hasMore ? items[items.length - 1].videoId : null,
        hasMore,
      },
    };
  }
```

**Step 6: Run test to verify it passes**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "getSavedVideos"`
Expected: PASS

**Step 7: Add pagination test for videos**
```typescript
  it('should paginate videos with cursor', async () => {
    const mockBookmarks = Array.from({ length: 21 }, (_, i) => ({
      id: `bm${i}`,
      createdAt: new Date(`2026-03-08T10:00:${i.toString().padStart(2, '0')}Z`),
      videoId: `v${i}`,
      video: {
        id: `v${i}`,
        title: `Video ${i}`,
        thumbnailUrl: `https://cdn.mizanly.com/videos/v${i}.jpg`,
        duration: 300 + i,
        viewsCount: 5000 + i * 100,
        likesCount: 200 + i * 10,
        createdAt: new Date(`2026-03-07T10:00:${i.toString().padStart(2, '0')}Z`),
        channel: { id: 'ch1', handle: 'testchannel', name: 'Test Channel', avatarUrl: 'avatar.jpg' }
      }
    }));
    mockPrisma.videoBookmark.findMany.mockResolvedValue(mockBookmarks);

    const result = await service.getSavedVideos('u1', 'v19');

    expect(result.data).toHaveLength(20);
    expect(result.data[0].id).toBe('v0');
    expect(result.data[19].id).toBe('v19');
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.cursor).toBe('v19');
  });
```

**Step 8: Run pagination test**
Run: `cd apps/api && npm test -- users.service.spec.ts -t "should paginate videos with cursor"`
Expected: PASS

**Step 9: Commit**
```bash
git add apps/api/src/modules/users/users.service.ts apps/api/src/modules/users/users.service.spec.ts
git commit -m "feat: add getSavedVideos method with tests"
```

---

### Task 4: Add Controller Endpoints

**Files:**
- Modify: `apps/api/src/modules/users/users.controller.ts` (after getSavedThreads, around line 86)
- Test: No controller tests needed (following existing pattern)

**Step 1: Examine existing saved endpoints pattern**
Check controller lines 65-85 to see pattern:
- `@Get('me/saved-posts')`
- `@UseGuards(ClerkAuthGuard)`
- `@ApiBearerAuth()`
- `@ApiOperation({ summary: 'Bookmarked posts' })`
- `getSavedPosts(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string)`

**Step 2: Add getSavedReels endpoint**
Add after `getSavedThreads` endpoint (around line 86):
```typescript
  @Get('me/saved-reels')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked reels' })
  getSavedReels(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedReels(userId, cursor);
  }
```

**Step 3: Add getSavedVideos endpoint**
Add immediately after getSavedReels:
```typescript
  @Get('me/saved-videos')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked videos' })
  getSavedVideos(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedVideos(userId, cursor);
  }
```

**Step 4: Verify TypeScript compilation**
Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors

**Step 5: Run all users service tests**
Run: `cd apps/api && npm test -- users.service.spec.ts`
Expected: All tests pass (including new ones)

**Step 6: Check Swagger documentation generation**
The `@ApiOperation` decorators should auto-generate Swagger docs. Verify no syntax errors.

**Step 7: Commit**
```bash
git add apps/api/src/modules/users/users.controller.ts
git commit -m "feat: add saved-reels and saved-videos controller endpoints"
```

---

### Task 5: Final Verification

**Step 1: Complete TypeScript compilation check**
Run: `cd apps/api && npx tsc --noEmit --skipLibCheck`
Expected: 0 errors

**Step 2: Run full test suite for users module**
Run: `cd apps/api && npm test -- --testPathPattern=users`
Expected: All tests pass

**Step 3: Verify no linting issues**
Run: `cd apps/api && npm run lint -- --quiet` (if lint script exists)
Check for any new lint errors.

**Step 4: Update CLAUDE.md endpoint count**
Check current endpoint count in CLAUDE.md (should be 163). Add 2 for new endpoints.
Modify: `CLAUDE.md` line with endpoint count
Change: `163 API endpoints` → `165 API endpoints`

**Step 5: Update MEMORY.md**
Add batch 15 entry to memory:
```
- **Batch 15 (2026-03-08):** Step 1 completed - getSavedReels/getSavedVideos endpoints added to backend.
```

**Step 6: Commit final changes**
```bash
git add CLAUDE.md C:\Users\shakh\.claude\projects\C--Users-shakh\memory\MEMORY.md
git commit -m "docs: update endpoint count and memory for saved endpoints"
```

---

### Task 6: Integration Smoke Test

**Step 1: Start backend in dev mode**
Run: `cd apps/api && npm run start:dev` (in separate terminal)
Expected: Server starts on port 3000

**Step 2: Check Swagger UI**
Open: `http://localhost:3000/docs`
Navigate to Users section, verify `/users/me/saved-reels` and `/users/me/saved-videos` endpoints appear.

**Step 3: Test with curl (optional)**
```bash
curl -H "Authorization: Bearer <test_jwt>" http://localhost:3000/api/v1/users/me/saved-reels
```
Expected: Returns empty array `{"data":[],"meta":{"cursor":null,"hasMore":false},"success":true,"timestamp":"..."}`

**Step 4: Stop dev server**
Ctrl+C in the terminal running dev server.

**Step 5: Final commit**
```bash
git add docs/plans/2026-03-08-step1-saved-endpoints-implementation.md
git commit -m "chore: complete step 1 implementation verification"
```

---

Plan complete and saved to `docs/plans/2026-03-08-step1-saved-endpoints-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**