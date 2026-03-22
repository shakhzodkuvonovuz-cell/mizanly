# Watch-Later Add/Remove Endpoints Design

**Date:** 2026-03-08
**Batch:** 14, Step 3
**Author:** Claude Opus 4.6
**Status:** Approved

## Context

The mobile app calls `usersApi.addWatchLater` and `usersApi.removeWatchLater` but the backend currently only has the GET endpoint (`/users/me/watch-later`). This step adds the missing POST and DELETE endpoints to allow adding/removing videos from the watch-later list.

## Design Decisions

- **Idempotent add**: Use `upsert` so duplicate requests don't cause errors.
- **Simple remove**: Use `deleteMany` which safely deletes 0 or 1 records.
- **No extra validation**: Rely on Prisma foreign key constraints; let NestJS handle constraint violations.
- **Response format**: `{ added: true }` / `{ removed: true }` (consistent with other action endpoints).

## Controller Changes (`apps/api/src/modules/users/users.controller.ts`)

Add two routes after the existing `getWatchLater` method:

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

## Service Changes (`apps/api/src/modules/users/users.service.ts`)

Add two methods after the existing `getWatchLater` method:

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

## Verification

1. **TypeScript compilation**: `cd apps/api && npx tsc --noEmit` must return 0 errors.
2. **Mobile API compatibility**: The existing `usersApi.addWatchLater` and `removeWatchLater` calls will now succeed.
3. **No regression**: Existing `GET /users/me/watch-later` continues to work.

## Edge Cases

- **Duplicate add**: `upsert` with empty `update` does nothing (idempotent).
- **Remove non-existent**: `deleteMany` returns count 0, still responds `{ removed: true }` (consistent with `clearWatchHistory`).
- **Video doesn't exist**: Foreign key constraint violation → Prisma throws → NestJS error handler returns appropriate HTTP error.

## Dependencies

- Prisma schema `WatchLater` model with composite primary key `@@id([userId, videoId])`.
- Existing imports in controller (`Post`, `Delete`, `Param`, `UseGuards`, etc.) already present.

## Success Criteria

- [ ] POST `/users/me/watch-later/:videoId` adds video to watch later list.
- [ ] DELETE `/users/me/watch-later/:videoId` removes video from watch later list.
- [ ] Both endpoints require authentication (Clerk JWT).
- [ ] Backend compiles with 0 TypeScript errors.