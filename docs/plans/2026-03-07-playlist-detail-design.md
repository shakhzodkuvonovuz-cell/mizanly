# Playlist Detail Screen Design
**Date:** 2026-03-07
**Feature:** Minbar V1.3 — Playlists
**Step:** 6 of ARCHITECT_INSTRUCTIONS.md
**Status:** Approved

## Overview
Playlist detail screen showing playlist metadata header and video list. Navigated from playlist list screen (`playlists/[channelId].tsx`).

## Design Decisions

### Header Content
- **Full header** with back button + playlist title + description + video count + channel link
- Follows pattern from `channel/[handle].tsx`
- Channel name is tappable → navigates to channel screen

### Loading States
- **Separate skeletons** for playlist header and video list
- Header skeleton: title placeholder (60% width), description placeholder (2 lines), metadata placeholders
- Video list skeleton: 3-4 `Skeleton.Rect` items with thumbnail + info layout
- Shows while respective queries are loading

### Error Handling
1. **Playlist metadata query fails**: Full-screen `EmptyState` with back navigation option
2. **Items query fails**: Error within list area (keep header, show `EmptyState` in list with retry button)
3. **Network errors**: Automatic retry via TanStack Query defaults

### Empty State (zero videos)
- **Icon:** `"video"`
- **Title:** `"No videos in playlist"`
- **Subtitle:** `"Videos you add will appear here"`
- **No action button** (add video flow handled via "Save to playlist" in video detail screen)

### Video Card Layout
- **Simplified version** (not the full `VideoCard` from minbar.tsx)
- Thumbnail (16:9 aspect ratio) with duration badge bottom-right
- Title (2 lines max)
- Channel name + views count
- **No avatar, no more button, no stats beyond views**
- Tap video → `/(screens)/video/${video.id}`
- Tap channel name → `/(screens)/channel/${handle}`

### Data Flow
```
Route params [id]
├── useQuery → playlistsApi.getById(id) → Playlist metadata
└── useInfiniteQuery → playlistsApi.getItems(id, cursor) → Paginated PlaylistItem[]
```

### Refresh & Pagination
- FlatList with `RefreshControl` (tint: `colors.emerald`)
- `onEndReached` triggers `fetchNextPage` when `hasNextPage`
- Pull-to-refresh refetches **both** queries

## Component Structure

```tsx
// Main screen structure
<SafeAreaView>
  <View style={styles.container}>
    {/* Header with back button */}
    <View style={styles.header}>
      <Icon name="arrow-left" onPress={() => router.back()} />
      <Text style={styles.headerTitle}>Playlist</Text>
    </View>

    {/* Playlist metadata section */}
    {playlistQuery.isLoading ? <PlaylistHeaderSkeleton /> : <PlaylistHeader data={playlist} />}

    {/* Video list */}
    <FlatList
      data={items}
      renderItem={({ item }) => <VideoItemCard item={item} />}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl ... />}
      onEndReached={handleEndReached}
      ListEmptyComponent={
        itemsQuery.isError ? <ErrorState /> :
        itemsQuery.isLoading ? <VideoListSkeleton /> :
        <EmptyState ... />
      }
      ListFooterComponent={itemsQuery.isFetchingNextPage ? <FooterSkeleton /> : null}
    />
  </View>
</SafeAreaView>
```

## Helper Functions

```ts
const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatViews = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};
```

## Styles & Theme
- **Background:** `colors.dark.bg`
- **Text colors:** `colors.text.primary` / `.secondary` / `.tertiary`
- **Spacing:** `spacing.xs` (4) to `spacing.2xl` (32)
- **Radius:** `radius.sm` (6), `radius.md` (10), `radius.lg` (16)
- **Thumbnail:** `aspectRatio: 16/9`, `borderRadius: radius.md`
- **Duration badge:** `backgroundColor: 'rgba(0,0,0,0.8)'`, `borderRadius: radius.sm`

## Integration Points
1. **Navigation:** From `playlists/[channelId].tsx` → `playlist/[id].tsx`
2. **API:** Uses `playlistsApi.getById` and `playlistsApi.getItems` (Step 4)
3. **Types:** Uses `Playlist` and `PlaylistItem` interfaces (Step 4)
4. **Video detail:** Navigates to existing `video/[id].tsx` screen
5. **Channel detail:** Navigates to existing `channel/[handle].tsx` screen

## Success Criteria
- [ ] Playlist metadata loads and displays correctly
- [ ] Video list loads with pagination (`onEndReached`)
- [ ] Pull-to-refresh works for both queries
- [ ] Loading skeletons show for header and list separately
- [ ] Error states handled appropriately per query
- [ ] Empty state shows when playlist has no videos
- [ ] Video tap navigates to video detail screen
- [ ] Channel name tap navigates to channel screen
- [ ] No `console.log` statements
- [ ] No `as any` type assertions
- [ ] Follows all CLAUDE.md rules (Icon, Skeleton, EmptyState, RefreshControl, etc.)

## Files to Create/Modify
- **Create:** `apps/mobile/app/(screens)/playlist/[id].tsx` (new)
- **Read reference:** `apps/mobile/app/(screens)/channel/[handle].tsx`
- **Read reference:** `apps/mobile/app/(tabs)/minbar.tsx` (for VideoCard pattern)

## Next Step
Proceed with implementation plan via writing-plans skill.