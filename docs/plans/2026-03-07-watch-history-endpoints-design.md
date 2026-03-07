# Watch History Endpoints Design

## Context
As part of Minbar V1.3 (playlists + watch history), Step 3 in ARCHITECT_INSTRUCTIONS.md requires adding watch history query endpoints to the backend.

The `videos.service.ts` already upserts `WatchHistory` records when a video is viewed, but there is no endpoint to query watch history. The `users.service.ts` has `getWatchLater()` but no `getWatchHistory()`.

## Design

### 1. Service Methods (`users.service.ts`)
- **`getWatchHistory(userId: string, cursor?: string, limit = 20)`**: Returns paginated watch history items for the user, ordered by `watchedAt` descending. Each item includes video details plus `progress`, `completed`, and `watchedAt` fields.
- **`clearWatchHistory(userId: string)`**: Deletes all watch history records for the user.

### 2. Controller Endpoints (`users.controller.ts`)
- **`GET /users/me/watch-history`**: Requires `ClerkAuthGuard`. Returns paginated watch history.
- **`DELETE /users/me/watch-history`**: Requires `ClerkAuthGuard`. Clears user's watch history.

### 3. Implementation Details
- Follow exact pattern of existing `getWatchLater()` method and endpoint.
- Use Prisma `findMany` with `include` to join video and channel data.
- Pagination uses cursor based on `WatchHistory.id`.
- Return format: `{ data: WatchHistoryItem[], meta: { cursor?, hasMore } }`.

### 4. Verification
- Run `cd apps/api && npx tsc --noEmit` to ensure no TypeScript errors.
- Run `npx jest --passWithNoTests` to ensure all existing tests pass.

## Source
Based on ARCHITECT_INSTRUCTIONS.md Step 3 (2026-03-07).