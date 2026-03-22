# Saved Screen Expansion + Share Fixes Design

**Date:** 2026-03-08
**Author:** Claude Opus 4.6
**Status:** Approved
**Related:** ARCHITECT_INSTRUCTIONS.md (Batch 15), CLAUDE.md (Saved screen, Share functionality)

---

## Overview
The Saved screen currently shows only Posts and Threads tabs, but users can bookmark Reels and Videos too — those bookmarks are invisible. Video share is a stub (`Alert.alert`). Reel share calls the API but never opens the native share sheet. This design fixes all three issues.

## Design Goals
- Expand Saved screen from 2 to 4 tabs (Posts, Threads, Reels, Videos)
- Implement real native share for Video and Reel screens
- Maintain consistent pagination, loading, and empty states
- Follow established codebase patterns exactly

---

## Backend Architecture

### Users Module Updates (`apps/api/src/modules/users/`)

#### New Service Methods
1. **`getSavedReels(userId: string, cursor?: string, limit = 20)`**
   - Query `ReelInteraction` where `userId` and `saved = true` (no separate `ReelBookmark` model)
   - Include `reel` relation with user details and media URLs
   - Pagination: cursor based on `@@unique([userId, reelId])` composite constraint

2. **`getSavedVideos(userId: string, cursor?: string, limit = 20)`**
   - Query `VideoBookmark` model (confirmed in schema)
   - Include `video` relation with channel details, title, duration, thumbnail
   - Pagination: cursor based on `@@id([userId, videoId])` composite primary key

#### Controller Endpoints (2 new)
- `GET /users/me/saved-reels` — Bookmarked reels (after existing `saved-threads`)
- `GET /users/me/saved-videos` — Bookmarked videos

Both endpoints:
- Require `ClerkAuthGuard` + `@ApiBearerAuth()`
- Use `@ApiOperation({ summary: 'Bookmarked reels/videos' })`
- Return `PaginatedResponse<Reel | Video>` with `isBookmarked: true`

#### Pagination Pattern
Follows existing `getSavedPosts`/`getSavedThreads`:
- `take: limit + 1`
- `orderBy: { createdAt: 'desc' }`
- `hasMore = results.length > limit`
- `cursor = hasMore ? lastItem.reelId/videoId : null`

---

## Mobile Architecture

### API Client Updates (`apps/mobile/src/services/api.ts`)
Already defined in codebase (confirmed via grep):
```typescript
getSavedReels: (cursor?: string) =>
  api.get<PaginatedResponse<Reel>>(`/users/me/saved-reels${qs({ cursor })}`),
getSavedVideos: (cursor?: string) =>
  api.get<PaginatedResponse<Video>>(`/users/me/saved-videos${qs({ cursor })}`),
```

### Saved Screen Expansion (`apps/mobile/app/(screens)/saved.tsx`)

#### Tab Expansion
- **Current:** 2 tabs (`posts`, `threads`)
- **New:** 4 tabs (`posts`, `threads`, `reels`, `videos`)
- Update `Tab` type and `TabSelector` component

#### Query Hooks
Add two new `useInfiniteQuery` hooks:
- `savedReelsQuery` (enabled when `activeTab === 'reels'`)
- `savedVideosQuery` (enabled when `activeTab === 'videos'`)

#### Render Sections
- **Reels:** Grid of thumbnails with play icon overlay (similar to posts grid)
- **Videos:** List rows with thumbnail, title, channel, duration
- **Navigation:** Reel tap → `/(screens)/reel/${reel.id}`, Video tap → `/(screens)/video/${video.id}`

#### Quality Requirements
- All FlatLists must have `<RefreshControl tintColor={colors.emerald} />`
- Use `EmptyState` for empty states, `Skeleton` for loading
- Follow MANDATORY CODE QUALITY RULES from CLAUDE.md

### Share Fixes

#### Video Share (`apps/mobile/app/(screens)/video/[id].tsx`)
Replace `Alert.alert` stub with:
```typescript
const handleShare = useCallback(async () => {
  if (!video) return;
  try {
    await Share.share({
      message: `${video.title}\n\nWatch on Mizanly`,
      url: `mizanly://video/${video.id}`,
    });
  } catch {
    // User cancelled — no action needed
  }
}, [video]);
```

#### Reel Share (`apps/mobile/app/(screens)/reel/[id].tsx`)
Update existing `handleShare` to open native share sheet after API call:
```typescript
const handleShare = useCallback(async () => {
  shareMutation.mutate();
  try {
    await Share.share({
      message: `Check this out on Mizanly`,
      url: `mizanly://reel/${id}`,
    });
  } catch {
    // User cancelled
  }
}, [id, shareMutation]);
```

---

## Testing Strategy

### Backend Tests (`apps/api/src/modules/users/users.service.spec.ts`)
Add tests for new methods:
- `describe('getSavedReels', ...)` — Mock `ReelInteraction.findMany`
- `describe('getSavedVideos', ...)` — Mock `VideoBookmark.findMany`

### Chat Gateway Spec (`apps/api/src/gateways/chat.gateway.spec.ts`)
New unit test file covering:
- Gateway instantiation
- `handleJoinConversation` → `socket.join`
- `handleSendMessage` → creates message + emits to room
- `handleTyping` → emits typing event to room

---

## Verification Checklist

1. **Backend Compilation:** `cd apps/api && npx tsc --noEmit` — 0 errors
2. **Test Suite:** `cd apps/api && npm test` — all tests pass
3. **Saved Screen:** Shows 4 tabs with appropriate content
4. **Video Share:** Opens native share sheet (not Alert)
5. **Reel Share:** Opens native share sheet + increments count

---

## Data Flow Diagrams

```
User Opens Saved Screen
         ↓
   Tab Selector (4 tabs)
         ↓
If reels/videos tab → Query enabled
         ↓
API: GET /users/me/saved-reels/videos
         ↓
Prisma: ReelInteraction.saved=true / VideoBookmark
         ↓
Return PaginatedResponse<Reel|Video>
         ↓
Render Grid/List with RefreshControl
```

```
User Clicks Share (Video/Reel)
         ↓
Video: Share.share() directly
Reel: shareMutation → API → Share.share()
         ↓
Native Share Sheet Opens
         ↓
User selects platform/cancels
```

---

## Success Criteria
- Saved screen displays all 4 content types user has bookmarked
- Video and Reel share buttons open native platform share sheet
- No regressions in existing Saved Posts/Threads functionality
- All new code follows established patterns and quality rules