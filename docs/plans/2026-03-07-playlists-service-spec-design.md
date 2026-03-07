# Playlists Service Spec Design
**Date:** 2026-03-07
**Batch:** 12 (Minbar V1.3 — Playlists + Watch History)
**Step:** 2 (Create playlists service spec)

## Context
This design documents the test specification for the `PlaylistsService` as part of Batch 12, Step 2. The service implements CRUD operations for playlists and playlist items in the Minbar (YouTube-like) space. The Prisma schema already has `Playlist` and `PlaylistItem` models. The service implementation is defined in ARCHITECT_INSTRUCTIONS.md Step 1.

## Design Decisions

### 1. Mock Pattern
Follows the exact pattern from `channels.service.spec.ts`:
- Mock Prisma service with jest.fn() for all database operations
- Mock `$transaction` to execute array of functions
- Type assertions with `as any` (allowed in test files per CLAUDE.md rule 13)

### 2. Test Organization
8 `describe` blocks, one per service method:
1. `create` — playlist creation with ownership verification
2. `getById` — single playlist retrieval
3. `getByChannel` — paginated list for a channel
4. `getItems` — paginated playlist items (videos)
5. `update` — playlist updates with ownership check
6. `delete` — playlist deletion with ownership check
7. `addItem` — add video to playlist with auto-position
8. `removeItem` — remove video from playlist

### 3. Test Coverage (20+ tests)
Each method tested for:
- **Success cases** (valid input, correct ownership)
- **NotFoundException** (channel/playlist not found)
- **ForbiddenException** (user doesn't own the channel)
- **Pagination** for `getByChannel` and `getItems` (cursor logic, hasMore)

### 4. Mock Data Constants
```typescript
const USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';
const CHANNEL_ID = 'channel-789';
const PLAYLIST_ID = 'playlist-abc';
const VIDEO_ID = 'video-def';
```

### 5. Key Verification Points
- **Ownership check**: `channel.userId === userId`
- **Pagination**: `limit + 1` query pattern, `hasMore = items.length > limit`
- **Transaction handling**: `addItem` and `removeItem` use `$transaction`
- **Position calculation**: `aggregate._max.position` for `addItem`
- **Error messages**: Match ARCHITECT_INSTRUCTIONS.md exactly

## File Structure
```
apps/api/src/modules/playlists/playlists.service.spec.ts
├── Imports (Test, TestingModule, NotFoundException, ForbiddenException)
├── Mock Prisma service definition
├── beforeEach setup
├── 8 describe blocks (one per method)
│   ├── Success test
│   ├── NotFoundException test
│   └── ForbiddenException test (where applicable)
└── Pagination tests for getByChannel and getItems
```

## Success Criteria
1. File compiles with TypeScript (no errors)
2. All 20+ tests pass
3. Follows exact mock pattern from channels.service.spec.ts
4. Covers all 8 service methods from ARCHITECT_INSTRUCTIONS.md
5. Runs successfully with `cd apps/api && npx jest playlists.service.spec`

## Implementation Notes
- Use `jest.fn()` for all Prisma mock methods
- Mock `$transaction` to execute array of functions
- Test files may use `as any` for mocks (CLAUDE.md rule 13)
- Follow existing test patterns for consistency
- Ensure pagination logic matches service implementation

## Dependencies
- Assumes `PlaylistsService` implementation matches ARCHITECT_INSTRUCTIONS.md Step 1
- Relies on Prisma schema models `Playlist` and `PlaylistItem` existing
- Uses NestJS testing utilities (`Test`, `TestingModule`)

## Next Steps
After design approval: Invoke `writing-plans` skill to create implementation plan, then implement `playlists.service.spec.ts`.