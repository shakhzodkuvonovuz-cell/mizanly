# Playlist Detail Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create playlist detail screen showing playlist metadata header + video list with loading skeleton, error states, empty state, RefreshControl, and back button.

**Architecture:** Two independent TanStack Query hooks: `useQuery` for playlist metadata (`playlistsApi.getById`) and `useInfiniteQuery` for playlist items (`playlistsApi.getItems`). Follows pattern from `channel/[handle].tsx` with simplified video cards.

**Tech Stack:** React Native (Expo SDK 52), Expo Router, TanStack Query, TypeScript, Mizanly design tokens.

---

### Task 1: Create file structure and basic imports

**Files:**
- Create: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Create directory and file**

```bash
mkdir -p apps/mobile/app/\(screens\)/playlist
touch apps/mobile/app/\(screens\)/playlist/\[id\].tsx
```

**Step 2: Write basic imports and component skeleton**

```tsx
import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, FlatList,
  RefreshControl, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi } from '@/services/api';
import type { Playlist, PlaylistItem } from '@/types';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text>Playlist Detail {id}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
});
```

**Step 3: Verify file exists**

Run: `ls -la apps/mobile/app/\(screens\)/playlist/\[id\].tsx`
Expected: File exists with above content

**Step 4: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: scaffold playlist detail screen"
```

---

### Task 2: Add playlist metadata query and header skeleton

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Add playlist query**

```tsx
// Inside PlaylistScreen component, after state declarations
const playlistQuery = useQuery({
  queryKey: ['playlist', id],
  queryFn: () => playlistsApi.getById(id!),
  enabled: !!id,
});
```

**Step 2: Add header skeleton component**

```tsx
function PlaylistHeaderSkeleton() {
  return (
    <View style={styles.headerSkeleton}>
      <Skeleton.Rect width="60%" height={24} borderRadius={radius.sm} />
      <Skeleton.Rect width="90%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
      <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
    </View>
  );
}
```

**Step 3: Add header skeleton styles**

```tsx
const styles = StyleSheet.create({
  // ... existing styles
  headerSkeleton: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
});
```

**Step 4: Update render to show skeleton when loading**

```tsx
// In the return JSX, replace the placeholder Text
<SafeAreaView style={styles.container} edges={['top']}>
  {/* Header with back button */}
  <View style={styles.header}>
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Icon name="arrow-left" size="md" color={colors.text.primary} />
    </Pressable>
    <Text style={styles.headerTitle}>Playlist</Text>
  </View>

  {/* Playlist metadata skeleton */}
  {playlistQuery.isLoading && <PlaylistHeaderSkeleton />}
</SafeAreaView>
```

**Step 5: Add header styles**

```tsx
const styles = StyleSheet.create({
  // ... existing
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginLeft: spacing.md,
  },
});
```

**Step 6: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: add playlist query and header skeleton"
```

---

### Task 3: Add playlist metadata header component

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Add PlaylistHeader component**

```tsx
function PlaylistHeader({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const haptic = useHaptic();

  const handleChannelPress = () => {
    haptic.light();
    // Note: playlist doesn't contain channel handle, need to get from query
    // We'll handle this later when we have channel data
  };

  return (
    <View style={styles.playlistHeader}>
      <Text style={styles.playlistTitle}>{playlist.title}</Text>
      {playlist.description && (
        <Text style={styles.playlistDescription}>{playlist.description}</Text>
      )}
      <View style={styles.playlistMetaRow}>
        <Text style={styles.playlistMeta}>
          {playlist.videosCount} {playlist.videosCount === 1 ? 'video' : 'videos'}
        </Text>
        <Text style={styles.playlistMetaDot}>•</Text>
        <Text style={styles.playlistMeta}>Channel name TBD</Text>
      </View>
    </View>
  );
}
```

**Step 2: Add useHaptic import**

```tsx
// Add to imports
import { useHaptic } from '@/hooks/useHaptic';
```

**Step 3: Add playlist header styles**

```tsx
const styles = StyleSheet.create({
  // ... existing
  playlistHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  playlistTitle: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  playlistDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.4,
    marginBottom: spacing.md,
  },
  playlistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  playlistMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  playlistMetaDot: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
});
```

**Step 4: Update render to show header when data loaded**

```tsx
// Replace the skeleton section with:
{playlistQuery.isLoading ? (
  <PlaylistHeaderSkeleton />
) : playlistQuery.isError ? (
  <View style={styles.errorContainer}>
    <EmptyState
      icon="layers"
      title="Playlist not found"
      subtitle="This playlist may have been deleted or is private"
      actionLabel="Go back"
      onAction={() => router.back()}
    />
  </View>
) : playlistQuery.data ? (
  <PlaylistHeader playlist={playlistQuery.data} />
) : null}
```

**Step 5: Add error container style**

```tsx
errorContainer: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: spacing.base,
},
```

**Step 6: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: add playlist header component with error state"
```

---

### Task 4: Add playlist items infinite query

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Add items query**

```tsx
const itemsQuery = useInfiniteQuery({
  queryKey: ['playlist-items', id],
  queryFn: ({ pageParam }) => playlistsApi.getItems(id!, pageParam),
  getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  initialPageParam: undefined as string | undefined,
  enabled: !!id && !!playlistQuery.data, // Only fetch items when playlist metadata loaded
});
```

**Step 2: Add video list skeleton component**

```tsx
function VideoListSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.videoSkeletonItem}>
          <Skeleton.Rect width="100%" height={180} borderRadius={radius.md} />
          <View style={styles.videoSkeletonInfo}>
            <Skeleton.Rect width="80%" height={16} borderRadius={radius.sm} />
            <Skeleton.Rect width="60%" height={14} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
          </View>
        </View>
      ))}
    </View>
  );
}
```

**Step 3: Add skeleton styles**

```tsx
const styles = StyleSheet.create({
  // ... existing
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
  },
  videoSkeletonItem: {
    marginBottom: spacing.lg,
  },
  videoSkeletonInfo: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
```

**Step 4: Add helper functions for formatting**

```tsx
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

**Step 5: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: add playlist items query and video skeleton"
```

---

### Task 5: Add simplified VideoItemCard component

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Add VideoItemCard component**

```tsx
function VideoItemCard({ item }: { item: PlaylistItem }) {
  const router = useRouter();
  const haptic = useHaptic();

  const handlePress = () => {
    haptic.light();
    router.push(`/(screens)/video/${item.video.id}`);
  };

  const handleChannelPress = () => {
    haptic.light();
    router.push(`/(screens)/channel/${item.video.channel.handle}`);
  };

  return (
    <TouchableOpacity style={styles.videoItem} activeOpacity={0.8} onPress={handlePress}>
      {/* Thumbnail with duration badge */}
      <View style={styles.thumbnailContainer}>
        {item.video.thumbnailUrl ? (
          <Image source={{ uri: item.video.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Icon name="video" size="lg" color={colors.text.secondary} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.video.duration)}</Text>
        </View>
      </View>

      {/* Video info */}
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>{item.video.title}</Text>
        <Pressable onPress={handleChannelPress} hitSlop={8}>
          <Text style={styles.channelName} numberOfLines={1}>{item.video.channel.name}</Text>
        </Pressable>
        <Text style={styles.videoStats} numberOfLines={1}>
          {formatViews(item.video.viewsCount)} views
        </Text>
      </View>
    </TouchableOpacity>
  );
}
```

**Step 2: Add video item styles**

```tsx
const styles = StyleSheet.create({
  // ... existing
  videoItem: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  videoInfo: {
    marginTop: spacing.sm,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  channelName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  videoStats: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
});
```

**Step 3: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: add simplified VideoItemCard component"
```

---

### Task 6: Add FlatList with refresh control and pagination

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Add refresh and pagination handlers**

```tsx
// Add these inside PlaylistScreen component
const onRefresh = useCallback(async () => {
  setRefreshing(true);
  await Promise.all([playlistQuery.refetch(), itemsQuery.refetch()]);
  setRefreshing(false);
}, [playlistQuery, itemsQuery]);

const onEndReached = useCallback(() => {
  if (itemsQuery.hasNextPage && !itemsQuery.isFetchingNextPage) {
    itemsQuery.fetchNextPage();
  }
}, [itemsQuery.hasNextPage, itemsQuery.isFetchingNextPage, itemsQuery.fetchNextPage]);

const videos: PlaylistItem[] = useMemo(() =>
  itemsQuery.data?.pages.flatMap((p) => p.data) ?? []
, [itemsQuery.data]);
```

**Step 2: Add FlatList component**

```tsx
// Replace the entire return JSX after the header section
return (
  <SafeAreaView style={styles.container} edges={['top']}>
    {/* Header with back button */}
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Icon name="arrow-left" size="md" color={colors.text.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>Playlist</Text>
    </View>

    {/* Playlist metadata or skeleton */}
    {playlistQuery.isLoading ? (
      <PlaylistHeaderSkeleton />
    ) : playlistQuery.isError ? (
      <View style={styles.errorContainer}>
        <EmptyState
          icon="layers"
          title="Playlist not found"
          subtitle="This playlist may have been deleted or is private"
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    ) : playlistQuery.data ? (
      <PlaylistHeader playlist={playlistQuery.data} />
    ) : null}

    {/* Video list */}
    <FlatList
      data={videos}
      renderItem={({ item }) => <VideoItemCard item={item} />}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.emerald}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        itemsQuery.isError ? (
          <View style={styles.listError}>
            <EmptyState
              icon="video"
              title="Failed to load videos"
              subtitle="Please check your connection"
              actionLabel="Retry"
              onAction={() => itemsQuery.refetch()}
            />
          </View>
        ) : itemsQuery.isLoading ? (
          <VideoListSkeleton />
        ) : (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="video"
              title="No videos in playlist"
              subtitle="Videos you add will appear here"
            />
          </View>
        )
      }
      ListFooterComponent={
        itemsQuery.isFetchingNextPage ? (
          <View style={styles.footerSkeleton}>
            <Skeleton.Rect width="100%" height={180} borderRadius={radius.md} />
          </View>
        ) : null
      }
    />
  </SafeAreaView>
);
```

**Step 3: Add list error and empty container styles**

```tsx
const styles = StyleSheet.create({
  // ... existing
  listError: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  emptyContainer: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  footerSkeleton: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
});
```

**Step 4: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "feat: add FlatList with refresh control and pagination"
```

---

### Task 7: Fix playlist header channel link

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Update playlist query to include channel handle**

The `playlistsApi.getById` returns playlist with channel data (including handle). Check the backend response includes `channel.handle`. If not, we need to update the API call or use a separate channel query. For now, assume it's included.

**Step 2: Update PlaylistHeader component to use channel data**

```tsx
function PlaylistHeader({ playlist }: { playlist: Playlist & { channel?: { id: string; handle: string; name: string; userId: string } } }) {
  const router = useRouter();
  const haptic = useHaptic();

  const handleChannelPress = () => {
    if (playlist.channel?.handle) {
      haptic.light();
      router.push(`/(screens)/channel/${playlist.channel.handle}`);
    }
  };

  return (
    <View style={styles.playlistHeader}>
      <Text style={styles.playlistTitle}>{playlist.title}</Text>
      {playlist.description && (
        <Text style={styles.playlistDescription}>{playlist.description}</Text>
      )}
      <View style={styles.playlistMetaRow}>
        <Text style={styles.playlistMeta}>
          {playlist.videosCount} {playlist.videosCount === 1 ? 'video' : 'videos'}
        </Text>
        {playlist.channel?.name && (
          <>
            <Text style={styles.playlistMetaDot}>•</Text>
            <Pressable onPress={handleChannelPress} hitSlop={8}>
              <Text style={[styles.playlistMeta, styles.channelLink]}>
                {playlist.channel.name}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
```

**Step 3: Add channel link style**

```tsx
channelLink: {
  color: colors.emerald,
},
```

**Step 4: Test by running TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: No errors related to playlist screen (may have other errors).

**Step 5: Commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "fix: add channel link to playlist header"
```

---

### Task 8: Final verification and cleanup

**Files:**
- Modify: `apps/mobile/app/(screens)/playlist/[id].tsx`

**Step 1: Remove any console.log statements**

Check for any accidental `console.log` and remove them.

**Step 2: Verify no `as any` type assertions**

Search file for `as any` and fix any type issues.

**Step 3: Run TypeScript compilation**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: 0 errors related to this file.

**Step 4: Check for missing imports**

Ensure all imports are present: `useHaptic`, etc.

**Step 5: Final commit**

```bash
git add apps/mobile/app/\(screens\)/playlist/\[id\].tsx
git commit -m "chore: final cleanup of playlist detail screen"
```

---

## Verification Checklist

```bash
# 1. File exists
ls -la apps/mobile/app/\(screens\)/playlist/\[id\].tsx

# 2. TypeScript compiles
cd apps/mobile && npx tsc --noEmit

# 3. No console statements
grep -n "console\." apps/mobile/app/\(screens\)/playlist/\[id\].tsx

# 4. No as any assertions
grep -n "as any" apps/mobile/app/\(screens\)/playlist/\[id\].tsx

# 5. Follows CLAUDE.md rules
# - Uses Icon component (not emoji) ✓
# - Uses Skeleton for loading ✓
# - Uses EmptyState for empty/error ✓
# - Uses RefreshControl ✓
# - Uses theme tokens ✓
```

**Success Criteria:**
- [ ] Playlist metadata loads and displays
- [ ] Video list loads with pagination
- [ ] Pull-to-refresh works for both queries
- [ ] Loading skeletons show separately
- [ ] Error states handled appropriately
- [ ] Empty state shows when no videos
- [ ] Video tap navigates to video detail
- [ ] Channel name tap navigates to channel screen
- [ ] No `console.log` statements
- [ ] No `as any` type assertions
- [ ] Follows all CLAUDE.md rules