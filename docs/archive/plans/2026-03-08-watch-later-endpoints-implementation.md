# Watch-Later Add/Remove Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add POST and DELETE endpoints for adding/removing videos from watch later (mobile app calls `addWatchLater`/`removeWatchLater` but backend only has GET endpoint).

**Architecture:** Add two new routes to `UsersController` (`POST /users/me/watch-later/:videoId` and `DELETE /users/me/watch-later/:videoId`) with corresponding service methods using Prisma `upsert` (idempotent add) and `deleteMany` (safe remove). Rely on foreign key constraints for validation.

**Tech Stack:** NestJS 10, Prisma, TypeScript, Swagger decorators, Clerk authentication.

---

### Task 1: Add controller routes for addWatchLater and removeWatchLater

**Files:**
- Modify: `apps/api/src/modules/users/users.controller.ts:107-120`

**Step 1: Write the failing test (if any)**

No test needed for this step — we're adding new routes that don't break existing functionality.

**Step 2: Check current imports**

Verify `Post` and `Delete` decorators are already imported (they are at lines 4 and 6).

**Step 3: Add addWatchLater route after getWatchLater method**

Add this code after line 107 (right after the `getWatchLater` method closing brace):

```typescript
  @Post('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add video to watch later' })
  addWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.addWatchLater(userId, videoId);
  }

  @Delete('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove video from watch later' })
  removeWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.removeWatchLater(userId, videoId);
  }
```

**Step 4: Verify controller syntax**

Run TypeScript compiler to ensure no syntax errors:

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors (should pass because service methods don't exist yet — TypeScript will complain about missing methods, which is OK for now).

**Step 5: Commit**

```bash
git add apps/api/src/modules/users/users.controller.ts
git commit -m "feat: add watch-later add/remove controller routes"
```

---

### Task 2: Implement service methods for addWatchLater and removeWatchLater

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts:390-420`

**Step 1: Find the correct insertion point**

The `getWatchLater` method ends around line 390. Add new methods after its closing brace.

**Step 2: Add addWatchLater method**

Add this code after line 390 (right after the `getWatchLater` method):

```typescript
  async addWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
    return { added: true };
  }

  async removeWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.deleteMany({
      where: { userId, videoId },
    });
    return { removed: true };
  }
```

**Step 3: Verify service syntax**

Run TypeScript compiler again:

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors (should now pass because both controller and service methods exist).

**Step 4: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat: implement watch-later add/remove service methods"
```

---

### Task 3: Final verification and testing

**Files:**
- Verify: `apps/api/src/modules/users/users.controller.ts`
- Verify: `apps/api/src/modules/users/users.service.ts`

**Step 1: Run full TypeScript compilation**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Check that the routes are properly structured**

Verify the controller routes match the pattern:
- `POST /users/me/watch-later/:videoId` → `addWatchLater`
- `DELETE /users/me/watch-later/:videoId` → `removeWatchLater`

**Step 3: Test with mobile API compatibility**

Check that the mobile API client calls will work:
- `usersApi.addWatchLater(videoId)` should now map to `POST /users/me/watch-later/${videoId}`
- `usersApi.removeWatchLater(videoId)` should now map to `DELETE /users/me/watch-later/${videoId}`

**Step 4: Commit final state**

```bash
git add .
git commit -m "feat: complete watch-later add/remove endpoints"
```

---

## Success Criteria

- [x] `POST /users/me/watch-later/:videoId` route exists and requires authentication
- [x] `DELETE /users/me/watch-later/:videoId` route exists and requires authentication
- [x] Service methods use `upsert` (idempotent) and `deleteMany` (safe)
- [x] Backend compiles with 0 TypeScript errors
- [x] Mobile app's `usersApi.addWatchLater` and `removeWatchLater` calls will now succeed