# Batch 23: New Screens & Missing Features

## Overview
This batch builds **10 new screens** and **wires up 8 stub features** across the Mizanly mobile app. All backend APIs already exist — this is purely frontend work in `apps/mobile/`.

**Total: 10 new files + 8 existing file modifications**

---

## ABSOLUTE RULES — READ BEFORE TOUCHING ANY CODE

These are NON-NEGOTIABLE. Violating ANY of them will break the app.

### Component Rules
1. **NEVER use React Native `Modal`** — Always `<BottomSheet>` from `@/components/ui/BottomSheet`
2. **NEVER use bare `<ActivityIndicator>` for content loading** — Use `<Skeleton.*>` from `@/components/ui/Skeleton`. ActivityIndicator ONLY inside buttons during mutation.
3. **NEVER use bare `<Text>No items</Text>`** — Use `<EmptyState icon="..." title="..." />` from `@/components/ui/EmptyState`
4. **NEVER use text emoji for icons** — Use `<Icon name="..." />` from `@/components/ui/Icon`

### Style Rules
5. **NEVER hardcode `borderRadius` >= 6** — Use `radius.sm` (6), `radius.md` (10), `radius.lg` (16), `radius.xl` (24), `radius.full` (9999) from `@/theme`
6. **NEVER hardcode hex colors** — Use tokens from `@/theme` (`colors.text.primary`, `colors.dark.bg`, `colors.emerald`, etc.)
7. **ALL FlatLists MUST have pull-to-refresh** — `<RefreshControl tintColor={colors.emerald} />` or `onRefresh`+`refreshing` props
8. **ALL FlatLists MUST have `removeClippedSubviews={true}`**

### TypeScript Rules
9. **NEVER use `as any`** — If you need to cast router.push paths, use `as never` instead
10. **NEVER use `@ts-ignore` or `@ts-expect-error`**

### Routing Rules
11. All screen routes MUST use `/(screens)/` prefix: `router.push('/(screens)/call-history')` NOT `router.push('/call-history')`
12. New screen files go in `apps/mobile/app/(screens)/`

### Import Paths
13. Use `@/` prefix: `@/components/ui/Icon`, `@/theme`, `@/services/api`, `@/types`, `@/hooks/useHaptic`
14. Import theme tokens: `import { colors, spacing, fontSize, radius } from '@/theme'`
15. Import animation: `import { animation } from '@/theme'` — use `animation.spring.bouncy`, `.snappy`, `.responsive`, `.gentle`

### Screen Structure Pattern
Every new screen MUST follow this structure:
```tsx
import { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
// ... other imports

export default function ScreenName() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // ... hooks, queries, state

  // Error state
  if (query.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Title" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState icon="flag" title="Couldn't load content" subtitle="Check your connection and try again" actionLabel="Retry" onAction={() => query.refetch()} />
      </View>
    );
  }

  // Loading state
  if (query.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Title" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader ... />
      <FlatList
        contentContainerStyle={{ paddingTop: insets.top + 52 }}
        removeClippedSubviews={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
        ...
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  // ...
});
```

---

## AVAILABLE COMPONENTS REFERENCE

### Icon — Valid Names (use ONLY these)
```
heart, heart-filled, message-circle, bookmark, bookmark-filled, send, search, home,
play, pause, rewind, fast-forward, more-horizontal, share, check-circle, arrow-left,
plus, camera, image, mic, phone, video, settings, bell, user, users, globe, lock,
flag, trash, edit, x, chevron-right, chevron-left, chevron-down, repeat, eye, eye-off,
volume-x, volume-1, volume-2, mail, hash, trending-up, map-pin, link, clock, check,
check-check, paperclip, smile, at-sign, filter, layers, circle-plus, pencil, slash,
log-out, bar-chart-2, loader, maximize, music
```

### Skeleton Variants
```tsx
<Skeleton.Circle size={40} />
<Skeleton.Rect width="100%" height={14} borderRadius={radius.sm} />
<Skeleton.Text width="60%" />
<Skeleton.PostCard />     <Skeleton.ThreadCard />
<Skeleton.ConversationItem />   <Skeleton.ProfileHeader />
```

### Design Tokens
```
colors.emerald = #0A7B4F       colors.gold = #C8963E
colors.dark.bg = #0D1117       colors.dark.bgElevated = #161B22
colors.dark.bgCard = #1C2333   colors.dark.bgSheet = #21283B
colors.dark.surface = #2D3548  colors.dark.border = #30363D
colors.text.primary = #FFF     colors.text.secondary = #8B949E
colors.text.tertiary = #6E7781 colors.error = #F85149
colors.active.emerald10 = rgba(10,123,79,0.10)
colors.active.emerald20 = rgba(10,123,79,0.20)
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 xl=24 full=9999
```

---

## NEW SCREEN 1: `call-history.tsx`

**File:** `apps/mobile/app/(screens)/call-history.tsx`

A screen showing the user's call history (voice + video calls). Similar to WhatsApp's call log.

**API:** `callsApi.getHistory(cursor?)` → `PaginatedResponse<CallSession>`

**CallSession type:**
```ts
interface CallSession {
  id: string;
  callType: 'voice' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  callerId: string;
  caller?: User;
  receiverId: string;
  receiver?: User;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  createdAt: string;
}
```

**Requirements:**
- GlassHeader with title "Calls" and back button
- `useInfiniteQuery` with `callsApi.getHistory()`
- Each row shows: Avatar of the OTHER person (caller or receiver), their display name, call type icon (phone for voice, video for video), status (missed = red text, ended = show duration, declined = "Declined"), and timestamp via `formatDistanceToNowStrict`
- Missed calls should have the name in `colors.error` red
- Tapping a row navigates to `/(screens)/profile/${otherUser.username}`
- A phone/video icon on the right of each row that navigates to `/(screens)/call/${item.id}`
- Empty state: `icon="phone"` title="No calls yet" subtitle="Your call history will appear here"
- Pull-to-refresh, removeClippedSubviews, Skeleton loading
- Import `callsApi` from `@/services/api` and `CallSession` from `@/types`

---

## NEW SCREEN 2: `sticker-browser.tsx`

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`

A screen to browse and search sticker packs. Users can add packs to their collection.

**APIs:**
- `stickersApi.browsePacks(cursor?)` → `PaginatedResponse<StickerPack>`
- `stickersApi.searchPacks(query)` → `StickerPack[]`
- `stickersApi.getFeaturedPacks()` → `StickerPack[]`
- `stickersApi.addToCollection(packId)` → adds pack
- `stickersApi.removeFromCollection(packId)` → removes pack

**StickerPack type:**
```ts
interface StickerPack {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverUrl?: string;
  stickers: StickerItem[];
  userId: string;
  user?: User;
  isOfficial: boolean;
  downloadCount: number;
  createdAt: string;
}
interface StickerItem {
  id: string;
  imageUrl: string;
  emoji?: string;
  packId: string;
}
```

**Requirements:**
- GlassHeader with title "Stickers" and back button
- Search bar (TextInput) at top below header, with search icon, debounced search using `stickersApi.searchPacks`
- "Featured" horizontal section at top showing `stickersApi.getFeaturedPacks()` — horizontal ScrollView of pack cards
- Main list: `useInfiniteQuery` with `stickersApi.browsePacks()`
- Each pack card shows: coverUrl image (or first sticker imageUrl as fallback), pack name, sticker count (`pack.stickers.length`), download count, and an "Add" / "Added" button
- "Add" button calls `stickersApi.addToCollection(packId)` via useMutation, optimistic toggle
- Tapping a pack card navigates to `/(screens)/sticker-pack/${item.id}` — BUT this screen doesn't exist yet, so instead show a BottomSheet with the pack's stickers in a grid (3 columns), pack name, description, and Add/Remove button
- Empty state: `icon="smile"` title="No sticker packs" subtitle="Sticker packs will appear here"
- Use `Image` from `expo-image` for sticker images (better caching)
- Pull-to-refresh, removeClippedSubviews, Skeleton loading

---

## NEW SCREEN 3: `majlis-lists.tsx`

**File:** `apps/mobile/app/(screens)/majlis-lists.tsx`

Custom lists for Majlis threads (like X/Twitter Lists). Users can create lists and add members.

**API:** The API methods are available but need to check `api.ts`. Use these patterns:
- GET lists: `api.get<MajlisList[]>('/majlis-lists')` — import `api` from `@/services/api`
- Create: `api.post<MajlisList>('/majlis-lists', { name, description?, isPublic? })`
- Delete: `api.delete('/majlis-lists/${id}')`
- Get members: `api.get<User[]>('/majlis-lists/${id}/members')`
- Add member: `api.post('/majlis-lists/${id}/members/${userId}')`
- Remove member: `api.delete('/majlis-lists/${id}/members/${userId}')`

**MajlisList type:**
```ts
interface MajlisList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  membersCount: number;
  userId: string;
  createdAt: string;
}
```

**Requirements:**
- GlassHeader with title "Lists" and back button + right action "plus" icon to create
- FlatList showing all user's lists
- Each row: list name, description (1 line), member count, public/private icon (globe or lock)
- Tapping a row should show a BottomSheet with options: "View Members", "Edit", "Delete"
- "Create List" — show a BottomSheet with TextInput for name, description, and a Switch for isPublic, plus a "Create" GradientButton
- Delete with Alert confirmation
- Empty state: `icon="layers"` title="No lists yet" subtitle="Create lists to organize the threads you follow"
- Pull-to-refresh, Skeleton loading

---

## NEW SCREEN 4: `create-playlist.tsx`

**File:** `apps/mobile/app/(screens)/create-playlist.tsx`

Create a new Minbar playlist (name, description, visibility).

**API:**
- Create: `playlistsApi.create({ title, description?, isPublic? })` — check api.ts for exact method name. If it doesn't exist, use `api.post<Playlist>('/playlists', data)`
- The Playlist type already exists in types.

**Requirements:**
- GlassHeader with title "New Playlist" and back button
- Form with:
  - TextInput for title (required, max 100 chars) with CharCountRing
  - TextInput for description (optional, max 500 chars, multiline) with CharCountRing
  - Switch for "Public playlist" (default true)
- GradientButton at bottom: "Create Playlist"
- On success: `router.back()` and invalidate `['playlists']` query
- Show ActivityIndicator inside button while creating (this is the ONE place ActivityIndicator is acceptable)
- Validate title is not empty before allowing submit
- Use `useHaptic` — `haptic.success()` on create

---

## NEW SCREEN 5: `edit-channel.tsx`

**File:** `apps/mobile/app/(screens)/edit-channel.tsx`

Edit a Minbar channel's info. Accessed from `channel/[handle].tsx` if the viewer is the channel owner.

**API:**
- Get channel: `channelsApi.getByHandle(handle)` — already used in channel/[handle].tsx
- Update: `channelsApi.update(channelId, { name?, description?, avatarUrl? })` — check api.ts

**Requirements:**
- Receive `channelId` as route param: `const { channelId } = useLocalSearchParams<{ channelId: string }>()`
- GlassHeader with title "Edit Channel" and back button
- `useQuery` to fetch channel data with `channelsApi.getById(channelId)` or similar
- Form with:
  - Avatar picker (Pressable circle showing current avatar, tap to pick image via `expo-image-picker`, upload via `uploadApi.getPresignedUrl`)
  - TextInput for channel name
  - TextInput for description (multiline, max 500 chars) with CharCountRing
- GradientButton: "Save Changes"
- On success: invalidate `['channel']` queries, `router.back()`, `haptic.success()`

---

## NEW SCREEN 6: `trending-audio.tsx`

**File:** `apps/mobile/app/(screens)/trending-audio.tsx`

Browse trending audio tracks for Bakra (reels). Users pick a track to create a reel with it.

**API:**
- `audioTracksApi.getTrending()` → `AudioTrack[]`
- `audioTracksApi.browse(cursor?)` → `PaginatedResponse<AudioTrack>`
- `audioTracksApi.search(query)` → `AudioTrack[]`

**AudioTrack type:**
```ts
interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  usageCount: number;
  isTrending: boolean;
  genre?: string;
  userId: string;
  user?: User;
  createdAt: string;
}
```

**Requirements:**
- GlassHeader with title "Sounds" and back button + search icon right action
- Search bar (TextInput) when search icon tapped, debounced search via `audioTracksApi.search()`
- "Trending" horizontal section at top using `audioTracksApi.getTrending()` — horizontal row of track cards
- Main list: `useInfiniteQuery` with `audioTracksApi.browse()`
- Each row: cover image (or music icon placeholder), title, artist, usage count ("X reels"), duration formatted as M:SS
- Tapping a track navigates to `/(screens)/sound/${item.id}`
- A "Use Sound" button on each row that navigates to `/(screens)/create-reel?audioTrackId=${item.id}`
- Empty state: `icon="music"` title="No sounds yet" subtitle="Trending sounds will appear here"
- Pull-to-refresh, removeClippedSubviews, Skeleton loading

---

## NEW SCREEN 7: `my-reports.tsx`

**File:** `apps/mobile/app/(screens)/my-reports.tsx`

View user's own submitted reports and their status.

**API:**
- `reportsApi.getMine(cursor?)` → `PaginatedResponse<Report>`

**Report type (already exists):**
```ts
interface Report {
  id: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reportedPostId?: string;
  reportedUserId?: string;
  reportedCommentId?: string;
  reportedMessageId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
```

**Requirements:**
- GlassHeader with title "My Reports" and back button
- `useInfiniteQuery` with `reportsApi.getMine()`
- Each row: report reason, status badge (color-coded: pending=gold, reviewing=emerald, resolved=text.secondary, dismissed=error), content type ("Post", "User", "Comment", "Message"), and timestamp
- Status badge colors: pending → `colors.gold`, reviewing → `colors.emerald`, resolved → `colors.text.secondary`, dismissed → `colors.error`
- Tapping navigates to `/(screens)/reports/${item.id}`
- Empty state: `icon="flag"` title="No reports" subtitle="Reports you submit will appear here"
- Pull-to-refresh, Skeleton loading

---

## NEW SCREEN 8: `hashtag-explore.tsx`

**File:** `apps/mobile/app/(screens)/hashtag-explore.tsx`

A dedicated trending hashtags screen showing hashtags across all spaces.

**API:**
- `hashtagsApi.getTrending()` → `HashtagInfo[]`
- `hashtagsApi.search(query)` → `HashtagInfo[]`

**HashtagInfo type (already exists):**
```ts
interface HashtagInfo {
  name: string;
  postsCount: number;
  threadsCount: number;
  reelsCount: number;
}
```

**Requirements:**
- GlassHeader with title "Trending" and back button
- Search bar for hashtag search (debounced, `hashtagsApi.search()`)
- `useQuery` with `hashtagsApi.getTrending()`
- Each row: # + hashtag name (bold), total post count (`postsCount + threadsCount + reelsCount`), and a breakdown row below showing "X posts  Y threads  Z reels" in secondary text
- Tapping navigates to `/(screens)/hashtag/${item.name}`
- A trending flame icon or `trending-up` icon next to top trending ones
- Empty state: `icon="hash"` title="No trending hashtags" subtitle="Trending topics will appear here"
- Pull-to-refresh, Skeleton loading

---

## NEW SCREEN 9: `bookmark-collections.tsx`

**File:** `apps/mobile/app/(screens)/bookmark-collections.tsx`

View and manage bookmark collections (folders for saved content).

**API:**
- `bookmarksApi.getCollections()` → `BookmarkCollection[]`

**BookmarkCollection type:**
```ts
interface BookmarkCollection {
  name: string;
  count: number;
  thumbnailUrl?: string;
}
```

**Requirements:**
- GlassHeader with title "Collections" and back button
- `useQuery` with `bookmarksApi.getCollections()`
- Grid layout (2 columns) — each collection is a card with:
  - Thumbnail image (or bookmark icon placeholder if no thumbnailUrl)
  - Collection name
  - Item count ("X items")
- Tapping a collection navigates to `/(screens)/saved?collection=${item.name}` (pass as query param)
- A "All Saved" card at top that navigates to `/(screens)/saved` without a collection filter
- Empty state: `icon="bookmark"` title="No collections" subtitle="Organize your saved items into collections"
- Pull-to-refresh, Skeleton loading

---

## NEW SCREEN 10: `manage-broadcast.tsx`

**File:** `apps/mobile/app/(screens)/manage-broadcast.tsx`

Manage a broadcast channel — view subscribers, promote/demote admins, send messages.

**API:**
- `broadcastApi.getById(id)` → `BroadcastChannel`
- `broadcastApi.promoteToAdmin(channelId, userId)`
- `broadcastApi.demoteFromAdmin(channelId, userId)`
- `broadcastApi.removeSubscriber(channelId, userId)`
- `broadcastApi.pinMessage(channelId, messageId)`
- `broadcastApi.unpinMessage(channelId, messageId)`
- `broadcastApi.deleteMessage(channelId, messageId)`

**Requirements:**
- Receive `channelId` as route param
- GlassHeader with title "Manage Channel" and back button
- Sections:
  1. **Channel Info** — avatar, name, subscriber count, created date
  2. **Subscribers** — FlatList of subscribers with Avatar + name + role badge (Admin/Subscriber)
  3. Each subscriber row has a "more-horizontal" button → BottomSheet with: "Promote to Admin" (if subscriber), "Demote to Subscriber" (if admin), "Remove" (destructive, with Alert confirmation)
- All mutations use `useMutation` with optimistic updates where possible
- Skeleton loading, error state, pull-to-refresh

---

## TASK 11: Wire Up Stubs in Existing Files

### 11A. `conversation/[id].tsx` — Wire pin/unpin and star mutations

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`

Find the TODO comments for pin and star mutations and replace them with real API calls:

```tsx
// Find and replace the pin/unpin TODO (approximately lines 1397-1401):
// Replace the console.log('Pin'/'Unpin') with:
if (contextMenuMsg?.isPinned) {
  messagesApi.unpinMessage(id as string, contextMenuMsg.id).then(() => {
    queryClient.invalidateQueries({ queryKey: ['conversation-messages', id] });
  });
} else {
  messagesApi.pinMessage(id as string, contextMenuMsg.id).then(() => {
    queryClient.invalidateQueries({ queryKey: ['conversation-messages', id] });
  });
}

// Find and replace the star TODO (approximately line 1412-1413):
// Replace console.log('Star toggle') with:
messagesApi.toggleStar(id as string, contextMenuMsg.id).then(() => {
  queryClient.invalidateQueries({ queryKey: ['conversation-messages', id] });
});
```

**NOTE:** Check `api.ts` for the exact method names for pin/unpin/star. They may be `messagesApi.pin()`, `messagesApi.unpin()`, `messagesApi.star()`, `messagesApi.unstar()`. Use whatever exists. If the methods don't exist in api.ts, add them:
```tsx
pin: (conversationId: string, messageId: string) => api.post(`/messages/${conversationId}/${messageId}/pin`),
unpin: (conversationId: string, messageId: string) => api.delete(`/messages/${conversationId}/${messageId}/pin`),
toggleStar: (conversationId: string, messageId: string) => api.post(`/messages/${conversationId}/${messageId}/star`),
```

### 11B. `broadcast-channels.tsx` — Wire up search

**File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`

Find the `handleSearchSubmit` function with the TODO and console.log. Replace it with:

```tsx
const handleSearchSubmit = useCallback(async () => {
  if (!searchQuery.trim()) return;
  setDiscoverLoading(true);
  try {
    // Use the discover endpoint with search param, or a dedicated search endpoint if available
    const response = await broadcastApi.discover();
    // Filter client-side by name match (if no server search endpoint)
    const filtered = response.data.filter(ch =>
      ch.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setDiscoverChannels(filtered);
    setDiscoverHasMore(false);
  } catch (error) {
    console.error('Search failed', error);
  } finally {
    setDiscoverLoading(false);
  }
}, [searchQuery]);
```

### 11C. `community-posts.tsx` — Wire up long-press context menu

**File:** `apps/mobile/app/(screens)/community-posts.tsx`

Find the empty `handleLongPress` function. Replace it with a proper BottomSheet:

Add state: `const [selectedPost, setSelectedPost] = useState<ChannelPost | null>(null);`

```tsx
const handleLongPress = useCallback((post: ChannelPost) => {
  haptic.medium();
  setSelectedPost(post);
}, [haptic]);
```

Then add a BottomSheet in the JSX (before the closing `</View>`):

```tsx
<BottomSheet visible={!!selectedPost} onClose={() => setSelectedPost(null)}>
  <BottomSheetItem
    label="Delete Post"
    icon={<Icon name="trash" size="sm" color={colors.error} />}
    onPress={() => {
      if (!selectedPost) return;
      Alert.alert('Delete post?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          channelPostsApi.delete(channelId, selectedPost.id).then(() => {
            queryClient.invalidateQueries({ queryKey: ['channel-posts'] });
          });
          setSelectedPost(null);
        }},
      ]);
    }}
    destructive
  />
  <BottomSheetItem
    label="Copy Text"
    icon={<Icon name="link" size="sm" color={colors.text.primary} />}
    onPress={() => {
      if (selectedPost?.content) {
        Clipboard.setStringAsync(selectedPost.content);
      }
      setSelectedPost(null);
    }}
  />
</BottomSheet>
```

Make sure to import `BottomSheet, BottomSheetItem`, `Alert`, and `* as Clipboard from 'expo-clipboard'`.

### 11D. `live/[id].tsx` — Wire up share button

**File:** `apps/mobile/app/(screens)/live/[id].tsx`

Find the empty share `onPress={() => {}}` and replace with:

```tsx
onPress={() => {
  Share.share({ message: `Watch live on Mizanly: mizanly.app/live/${id}` });
}}
```

Make sure `Share` is imported from `react-native`.

### 11E. `save-to-playlist.tsx` — Wire up "Create New Playlist"

**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`

Find the `handleCreateNew` function with the "Coming soon" Alert. Replace it to navigate to the new create-playlist screen:

```tsx
const handleCreateNew = () => {
  router.push('/(screens)/create-playlist' as never);
};
```

### 11F. `qr-code.tsx` — Wire up save to gallery

**File:** `apps/mobile/app/(screens)/qr-code.tsx`

Find the `handleSave` function with the "Coming soon" Alert. Replace it with actual save functionality:

```tsx
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

// Add a ref to the QR code view:
const qrRef = useRef<View>(null);

const handleSave = async () => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Mizanly to save to your photo library.');
      return;
    }
    if (!qrRef.current) return;
    const uri = await captureRef(qrRef.current, { format: 'png', quality: 1 });
    await MediaLibrary.saveToLibraryAsync(uri);
    haptic.success();
    Alert.alert('Saved', 'QR code saved to your gallery.');
  } catch {
    Alert.alert('Error', 'Failed to save QR code.');
  }
};
```

**NOTE:** This requires `expo-media-library` and `react-native-view-shot` packages. If they are not installed, just replace the alert with a simpler approach using `Share`:

```tsx
const handleSave = () => {
  Share.share({ message: `https://mizanly.app/profile/${username}` });
};
```

### 11G. `settings.tsx` — Add missing navigation links

**File:** `apps/mobile/app/(screens)/settings.tsx`

Add these rows to the appropriate sections:

In the **"Content"** section card (after "Content Preferences" row), add:
```tsx
<View style={styles.divider} />
<Row label="Drafts" hint="Your saved drafts" onPress={() => router.push('/(screens)/drafts')} />
<View style={styles.divider} />
<Row label="Archive" hint="Archived posts and stories" onPress={() => router.push('/(screens)/archive')} />
<View style={styles.divider} />
<Row label="Watch History" hint="Your video watch history" onPress={() => router.push('/(screens)/watch-history')} />
```

In the **"Creator"** section card (after "Analytics" row), add:
```tsx
<View style={styles.divider} />
<Row label="Broadcast Channels" hint="Manage your broadcast channels" onPress={() => router.push('/(screens)/broadcast-channels')} />
<View style={styles.divider} />
<Row label="My Reports" hint="Reports you've submitted" onPress={() => router.push('/(screens)/my-reports')} />
```

### 11H. `profile/[username].tsx` — Re-add majlis-lists button (now screen exists)

**File:** `apps/mobile/app/(screens)/profile/[username].tsx`

Find where the majlis-lists button was removed (near the archive and settings buttons, approximately line 650-654). Re-add it:

```tsx
<Pressable hitSlop={8} onPress={() => router.push('/(screens)/majlis-lists' as never)}>
  <Icon name="layers" size="sm" color={colors.text.primary} />
</Pressable>
```

---

## VERIFICATION CHECKLIST

After completing all tasks, verify:

1. **10 new screen files exist** in `app/(screens)/`: call-history.tsx, sticker-browser.tsx, majlis-lists.tsx, create-playlist.tsx, edit-channel.tsx, trending-audio.tsx, my-reports.tsx, hashtag-explore.tsx, bookmark-collections.tsx, manage-broadcast.tsx
2. **Every new screen has**: GlassHeader, loading skeleton, error state with EmptyState, empty state with EmptyState, pull-to-refresh
3. **No `as any` casts** — use `as never` for router paths if needed
4. **No `@ts-ignore` or `@ts-expect-error`**
5. **No bare `<ActivityIndicator>` for content loading** (only inside buttons)
6. **No hardcoded borderRadius >= 6**
7. **No hardcoded hex colors**
8. **All FlatLists have `removeClippedSubviews={true}`**
9. **All router.push paths use `/(screens)/` prefix**
10. **All stubs in existing files are wired to real API calls**
11. **settings.tsx has the new navigation rows**
12. **profile/[username].tsx has the majlis-lists button back**
