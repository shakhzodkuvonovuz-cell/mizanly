# Agent 45: Channel + Playlist + Series Screens — Deep Audit

**Scope:** 10 screen files across channel, playlist, series feature areas
**Files audited line-by-line:**
1. `apps/mobile/app/(screens)/channel/[handle].tsx` (849 lines)
2. `apps/mobile/app/(screens)/edit-channel.tsx` (321 lines)
3. `apps/mobile/app/(screens)/broadcast-channels.tsx` (448 lines)
4. `apps/mobile/app/(screens)/playlist/[id].tsx` (306 lines)
5. `apps/mobile/app/(screens)/playlists/[channelId].tsx` (271 lines)
6. `apps/mobile/app/(screens)/create-playlist.tsx` (321 lines)
7. `apps/mobile/app/(screens)/save-to-playlist.tsx` (334 lines)
8. `apps/mobile/app/(screens)/series-detail.tsx` (583 lines)
9. `apps/mobile/app/(screens)/series-discover.tsx` (483 lines)
10. `apps/mobile/app/(screens)/series/[id].tsx` (500 lines)

**Total findings: 42**

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: broadcast-channels.tsx — Screen loads completely empty (no data fetch on mount)
**File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
**Lines:** 74-107
**Severity:** P0 — SHIP BLOCKER
**Code:**
```tsx
const loadDiscoverChannels = useCallback(async (refresh = false) => {
  // ...fetches data...
}, [discoverCursor, discoverLoading]);

const loadMyChannels = useCallback(async (refresh = false) => {
  // ...fetches data...
}, [myChannelsLoading]);
```
**Problem:** There is NO `useEffect` anywhere in this 448-line file. The `loadDiscoverChannels` and `loadMyChannels` functions are defined as callbacks but are NEVER called on mount. The screen renders with empty arrays and shows the empty state permanently. The only way to see data is to pull-to-refresh, which is undiscoverable.
**Fix:** Add `useEffect(() => { loadDiscoverChannels(true); }, []);` and similarly for `loadMyChannels` when tab switches.

### Finding 2: broadcast-channels.tsx — Backslash in broadcastApi.discover URL path
**File:** `apps/mobile/src/services/api.ts`
**Line:** 860
**Severity:** P0 — API CALL ALWAYS FAILS
**Code:**
```ts
discover: (cursor?: string) =>
  api.get<PaginatedResponse<BroadcastChannel>>(`\broadcast-channels\discover${cursor ? `?cursor=${cursor}` : ''}`),
```
**Problem:** The URL uses backslashes (`\broadcast-channels\discover`) instead of forward slashes. JavaScript template literal backslashes are escape characters, so `\b` = backspace (0x08), `\d` = literal `d`. The actual URL sent will be completely mangled, producing a 404 on every call. This affects `broadcastApi.discover()` and `broadcastApi.getMessages()` (line 878 has the same issue).
**Impact:** Broadcast channel discovery is completely broken at the API layer.

### Finding 3: Two competing series detail screens with divergent interfaces
**File 1:** `apps/mobile/app/(screens)/series-detail.tsx`
**File 2:** `apps/mobile/app/(screens)/series/[id].tsx`
**Severity:** P0 — ARCHITECTURAL CONFUSION
**Problem:** Two completely independent screens both display series detail. They use different:
- **Interface field names:** File 1 uses `Episode.number` + `Episode.createdAt`; File 2 uses `Episode.episodeNumber` + `Episode.releaseDate`
- **Cover image field:** File 1 uses `SeriesDetail.coverUrl`; File 2 uses `SeriesDetail.coverImageUrl`
- **Follower count field:** File 1 uses `SeriesDetail.followerCount`; File 2 uses `SeriesDetail.followerCount` (same)
- **isCreator field:** File 1 has `isCreator` field (for add episode); File 2 does not
- **Route path:** File 1 is `/(screens)/series-detail?id=X`; File 2 is `/(screens)/series/[id]`
- **Navigation from series-discover.tsx (line 122):** `router.push('/(screens)/series-detail?id=${series.id}')` — goes to File 1

**Schema check:** Prisma model `SeriesEpisode` uses `number` (not `episodeNumber`) and `createdAt` (not `releaseDate`), and `Series` uses `coverUrl` (not `coverImageUrl`). So File 2 (series/[id].tsx) has WRONG field names that won't display data.

### Finding 4: series-detail.tsx — Add Episode buttons are stubs (no navigation, no API call)
**File:** `apps/mobile/app/(screens)/series-detail.tsx`
**Lines:** 353-380
**Severity:** P0 — FEATURE NON-FUNCTIONAL
**Code:**
```tsx
<BottomSheetItem
  label={t('series.linkPost', 'Link a Post')}
  icon={<Icon name="image" size="md" color={colors.text.primary} />}
  onPress={() => {
    setAddEpisodeSheet(false);
    // Navigate to post picker
  }}
/>
<BottomSheetItem
  label={t('series.linkReel', 'Link a Reel')}
  icon={<Icon name="video" size="md" color={colors.text.primary} />}
  onPress={() => {
    setAddEpisodeSheet(false);
    // Navigate to reel picker
  }}
/>
<BottomSheetItem
  label={t('series.linkVideo', 'Link a Video')}
  icon={<Icon name="play" size="md" color={colors.text.primary} />}
  onPress={() => {
    setAddEpisodeSheet(false);
    // Navigate to video picker
  }}
/>
```
**Problem:** All three "Link a Post/Reel/Video" actions only close the sheet. The `// Navigate to ...` comments are TODO stubs. The API exists (`gamificationApi.addEpisode`) but is never called. Creators cannot add episodes to their series.

---

## HIGH (P1) — Major Bugs

### Finding 5: create-playlist.tsx — Query key mismatch prevents list refresh after creating playlist
**File:** `apps/mobile/app/(screens)/create-playlist.tsx`
**Line:** 50
**Severity:** P1 — UX BUG
**Code:**
```tsx
onSuccess: (newPlaylist) => {
  haptic.success();
  queryClient.invalidateQueries({ queryKey: ['playlists', channelId] });
  router.back();
},
```
**Problem:** The invalidation key is `['playlists', channelId]` but the channel playlists screen (`playlists/[channelId].tsx` line 51) uses `['channel-playlists', channelId]` as its query key. The channel/[handle].tsx screen also uses `['channel-playlists', channel?.id]` (line 203). Since the keys don't match, creating a playlist doesn't refresh the playlists list — the user navigates back to a stale screen.
**Fix:** Change line 50 to `queryClient.invalidateQueries({ queryKey: ['channel-playlists', channelId] });`

### Finding 6: save-to-playlist.tsx — useMemo used for side effects (setState inside useMemo)
**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`
**Lines:** 73-81
**Severity:** P1 — REACT ANTI-PATTERN / POTENTIAL CRASH
**Code:**
```tsx
useMemo(() => {
  const newMap: Record<string, boolean> = {};
  playlists.forEach((playlist, idx) => {
    if (inclusionQueries[idx]?.data !== undefined) {
      newMap[playlist.id] = inclusionQueries[idx].data!;
    }
  });
  setInPlaylistMap(newMap);  // <-- setState inside useMemo!
}, [playlists, inclusionQueries]);
```
**Problem:** `useMemo` is being used to trigger `setState` as a side effect. This is a React anti-pattern — `useMemo` is for memoizing computed values, not for triggering side effects. This will:
1. Cause a render loop warning in React strict mode (setState during render)
2. May cause infinite re-render loops since `setInPlaylistMap` triggers a re-render which re-evaluates the memo
**Fix:** Use `useEffect` instead of `useMemo`.

### Finding 7: save-to-playlist.tsx — N+1 query problem: fetches ALL items for EVERY playlist
**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`
**Lines:** 61-70
**Severity:** P1 — PERFORMANCE
**Code:**
```tsx
const inclusionQueries = useQueries({
  queries: playlists.map(playlist => ({
    queryKey: ['playlist-inclusion', playlist.id, videoId],
    queryFn: async () => {
      const items = await playlistsApi.getItems(playlist.id);
      return items.data.some(item => item.video.id === videoId);
    },
    enabled: !!videoId && playlists.length > 0,
  })),
});
```
**Problem:** For each playlist, the screen fetches ALL playlist items and then checks client-side if the video is included. If a user has 10 playlists with 50 videos each, that's 10 API calls returning 500 video objects just to check inclusion. Should use a dedicated backend endpoint like `/playlists/check-inclusion?videoId=X`.

### Finding 8: save-to-playlist.tsx — Also fetches all playlists sequentially per channel
**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`
**Lines:** 39-54
**Severity:** P1 — PERFORMANCE
**Code:**
```tsx
queryFn: async () => {
  const allPlaylists: Playlist[] = [];
  for (const channel of channels) {
    try {
      const resp = await playlistsApi.getByChannel(channel.id);
      allPlaylists.push(...resp.data);
    } catch (err) {
      // ignore individual channel errors
    }
  }
  return allPlaylists;
},
```
**Problem:** Sequential `for` loop makes one API call per channel. If a user has 5 channels, this is 5 sequential API calls. Should use `Promise.all` for parallel fetching, or better yet, have a single backend endpoint that returns all playlists for the current user.

### Finding 9: series/[id].tsx — Wrong field names for cover image (coverImageUrl vs coverUrl)
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Line:** 48, 185-196
**Severity:** P1 — DATA NOT DISPLAYED
**Code:**
```tsx
interface SeriesDetail {
  // ...
  coverImageUrl?: string;  // WRONG: Prisma uses `coverUrl`
  // ...
}
// ...
{data.coverImageUrl ? (
  <Image source={{ uri: data.coverImageUrl }} ... />
) : (
  <LinearGradient ... />
)}
```
**Problem:** The Prisma schema (`Series` model) has `coverUrl` but this screen uses `coverImageUrl`. The cover image will NEVER display — it will always show the placeholder gradient.

### Finding 10: series/[id].tsx — Wrong Episode field names (episodeNumber vs number, releaseDate vs createdAt)
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Lines:** 33-41, 95, 105
**Severity:** P1 — DATA NOT DISPLAYED
**Code:**
```tsx
interface Episode {
  // ...
  episodeNumber: number;  // WRONG: Prisma uses `number`
  releaseDate: string;    // WRONG: Prisma uses `createdAt` or `releasedAt`
  // ...
}
// Line 95:
<Text style={styles.episodeNumber}>{episode.episodeNumber}</Text>  // undefined
// Line 105:
{new Date(episode.releaseDate).toLocaleDateString()}  // Invalid Date
```
**Problem:** Two field name mismatches vs the Prisma `SeriesEpisode` model. `episodeNumber` should be `number`, `releaseDate` should be `createdAt` (or `releasedAt`). Episodes will show `undefined` for number and "Invalid Date" for date.

### Finding 11: series/[id].tsx — Profile navigation uses userId instead of username
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Line:** 215
**Severity:** P1 — NAVIGATION BUG
**Code:**
```tsx
router.push(`/(screens)/profile/${data.creator.id}` as never)
```
**Problem:** The profile screen uses `[username]` as its route parameter, but this navigation passes `data.creator.id` (a CUID/UUID). This will either 404 or show the wrong profile. Compare with series-detail.tsx line 247 which correctly uses `?username=${series.creator.username}`.

### Finding 12: series/[id].tsx — Hardcoded English string "Complete Series"
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Line:** 206
**Severity:** P1 — i18n VIOLATION
**Code:**
```tsx
<Text style={styles.completeBadgeText}>Complete Series</Text>
```
**Problem:** Hardcoded English string, should use `t('series.completeSeries')`.

### Finding 13: series/[id].tsx — Hardcoded English "Episodes ({count})"
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Line:** 268
**Severity:** P1 — i18n VIOLATION
**Code:**
```tsx
<Text style={styles.episodesHeaderText}>
  Episodes ({data.episodes?.length ?? 0})
</Text>
```
**Problem:** Hardcoded English. Should use `t()`.

---

## MEDIUM (P2) — Functional Issues

### Finding 14: broadcast-channels.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
**Lines:** 8, 13
**Severity:** P2 — COMPILE WARNING / POTENTIAL CRASH
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Alert,
  NativeSyntheticEvent, TextInputSubmitEditingEventData,
  Pressable,  // DUPLICATE
} from 'react-native';
```
**Problem:** `Pressable` is imported twice from react-native. This produces a compile warning and in some bundler configurations can cause a crash.

### Finding 15: playlist/[id].tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/playlist/[id].tsx`
**Lines:** 4, 5
**Severity:** P2 — COMPILE WARNING
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,
  FlatList, RefreshControl,
  Pressable,  // DUPLICATE
} from 'react-native';
```

### Finding 16: playlists/[channelId].tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/playlists/[channelId].tsx`
**Lines:** 3, 5
**Severity:** P2 — COMPILE WARNING
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, Image,
  RefreshControl, FlatList,
  Pressable,  // DUPLICATE
} from 'react-native';
```

### Finding 17: series-detail.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/series-detail.tsx`
**Lines:** 8, 11
**Severity:** P2 — COMPILE WARNING
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  ScrollView, Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```

### Finding 18: series-discover.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Lines:** 8, 11
**Severity:** P2 — COMPILE WARNING
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  ScrollView, Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```

### Finding 19: series/[id].tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/series/[id].tsx`
**Lines:** 8, 10
**Severity:** P2 — COMPILE WARNING
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
  Dimensions,
  Pressable,  // DUPLICATE
} from 'react-native';
```

### Finding 20: playlists/[channelId].tsx — Uses RN Image instead of expo-image
**File:** `apps/mobile/app/(screens)/playlists/[channelId].tsx`
**Line:** 3
**Severity:** P2 — PERFORMANCE
**Code:**
```tsx
import { View, Text, StyleSheet, Pressable, Image, ... } from 'react-native';
```
**Problem:** Imports `Image` from react-native instead of `expo-image`. The expo-image `Image` component supports caching, progressive loading, and better performance. However, this `Image` is actually unused in the render — the component only shows thumbnail-less placeholder icons. The import is dead code.

### Finding 21: channel/[handle].tsx — Uses RN Image instead of expo-image
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Line:** 4
**Severity:** P2 — PERFORMANCE / CONSISTENCY
**Code:**
```tsx
import { ..., Image, ... } from 'react-native';
```
**Problem:** Uses React Native's `Image` for thumbnails and banners throughout the file instead of `expo-image`'s `Image` component which provides better caching and performance.

### Finding 22: channel/[handle].tsx — Hardcoded English strings
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Lines:** Multiple
**Severity:** P2 — i18n VIOLATION
**Code:**
```tsx
// Line 265: Alert.alert('Copied', 'Channel link copied to clipboard');
// Line 471: actionLabel="Go back"
// Line 491: actionLabel="Go back"
// Line 555: channel.description || 'No description provided.'
// Line 580: <Text style={styles.sheetTitle}>Channel options</Text>
// Line 158: <Text style={styles.playlistMeta}>{playlist.videosCount} videos</Text>
```
**Problem:** 6+ hardcoded English strings that should use `t()`.

### Finding 23: playlist/[id].tsx — Hardcoded English strings
**File:** `apps/mobile/app/(screens)/playlist/[id].tsx`
**Lines:** Multiple
**Severity:** P2 — i18n VIOLATION
**Code:**
```tsx
// Line 158: accessibilityLabel: 'Go back'
// Line 176: accessibilityLabel: 'Go back'
// Line 185: actionLabel="Go back"
// Line 197: title={playlist?.title ?? 'Playlist'}
// Line 200: accessibilityLabel: 'Go back'
// Line 231: actionLabel="Retry"
```
**Problem:** 6 hardcoded English strings.

### Finding 24: series-discover.tsx — Hardcoded English category labels
**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Lines:** 33-40
**Severity:** P2 — i18n VIOLATION
**Code:**
```tsx
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'drama', label: 'Drama' },
  { key: 'documentary', label: 'Documentary' },
  { key: 'tutorial', label: 'Tutorial' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'islamic', label: 'Islamic' },
] as const;
```
**Problem:** Category labels are hardcoded English, not using `t()`. This is defined outside the component as a module-level constant, so `t()` can't be used here. The constant should be moved inside the component or labels should use i18n keys.

### Finding 25: series-discover.tsx — Hardcoded English accessibility labels
**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Lines:** 229
**Severity:** P2 — i18n VIOLATION
**Code:**
```tsx
accessibilityLabel={item.isFollowing ? 'Unfollow' : 'Follow'}
```

### Finding 26: series-detail.tsx — Share button is a no-op
**File:** `apps/mobile/app/(screens)/series-detail.tsx`
**Lines:** 310-313
**Severity:** P2 — FEATURE STUB
**Code:**
```tsx
rightActions={[
  {
    icon: 'share',
    onPress: () => haptic.light(),  // Only plays haptic, does nothing else
    accessibilityLabel: t('common.share', 'Share'),
  },
]}
```
**Problem:** The share button only plays a haptic — no Share.share() call, no bottom sheet, no clipboard copy.

### Finding 27: edit-channel.tsx — Avatar picker sets local URI but never uploads
**File:** `apps/mobile/app/(screens)/edit-channel.tsx`
**Lines:** 77-93, 100-104
**Severity:** P2 — FEATURE BROKEN
**Code:**
```tsx
const pickImage = async () => {
  // ...
  setAvatarUrl(result.assets[0].uri);  // Local file:// URI
  // ...
};

const handleSave = () => {
  updateMutation.mutate({
    name: name.trim(),
    description: description.trim() || undefined,
    avatarUrl: avatarUrl || undefined,  // Sends local file:// URI to API
  });
};
```
**Problem:** The image picker sets a local `file://` URI as the avatar URL. This is then sent directly to the API as `avatarUrl`. The backend expects a hosted URL (R2/CDN), not a local file path. The avatar won't display for other users because the URI is only valid on the device that selected it. A presigned upload flow is needed.

### Finding 28: channel/[handle].tsx — useMemo for ListHeader has stale closures
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Lines:** 281-442
**Severity:** P2 — STALE DATA BUG
**Code:**
```tsx
const ListHeader = useMemo(() => (
  <View>
    {/* ... references handleSubscribe, handleShare, etc ... */}
  </View>
), [channel, handle, subscribeMutation.isPending, featuredVideo, activeTab, CHANNEL_TABS, showTrailerSection, t]);
```
**Problem:** The `useMemo` captures `handleSubscribe` and other handler functions in its closure but does NOT include them in the dependency array. When the component re-renders with new handlers (e.g., after subscription state changes), the memoized JSX still references the old handler closures. This can cause subscribe/unsubscribe to use stale state.

### Finding 29: channel/[handle].tsx — About tab content rendered as ListEmptyComponent
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Lines:** 553-567
**Severity:** P2 — UX ARCHITECTURE BUG
**Code:**
```tsx
} : (
  <View style={styles.aboutTab}>
    <Text style={styles.aboutDescription}>{channel.description || 'No description provided.'}</Text>
    ...
  </View>
)
```
**Problem:** The "About" tab content is rendered as the FlatList's `ListEmptyComponent`. This means:
1. It only shows when `data` array is empty (which it is for About since FlatList gets `[]`)
2. If the FlatList data had items, the About content would never show
3. The about section IS the empty state, which is semantically wrong
This "works" coincidentally because `data` is `[]` for the about tab, but it's fragile.

### Finding 30: channel/[handle].tsx — FlatList type union is messy and type-unsafe
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Lines:** 516-519
**Severity:** P2 — TYPE SAFETY
**Code:**
```tsx
<FlatList<Video | Playlist>
  data={activeTab === 'videos' ? regularVideos : activeTab === 'playlists' ? playlists : []}
  // ...
  renderItem={activeTab === 'videos' ? ({ item }) => <VideoCard video={item as Video} /> : activeTab === 'playlists' ? ({ item }) => <PlaylistCard playlist={item as Playlist} /> : undefined}
```
**Problem:** Uses `as Video` and `as Playlist` type assertions to cast the union type. The `renderItem` can be `undefined` (when `activeTab === 'about'`), which is not a valid value for `renderItem`. This should use discriminated types or separate FlatLists per tab.

---

## LOW (P3) — Polish / Improvement

### Finding 31: series-detail.tsx — series.followerCount vs Prisma followersCount
**File:** `apps/mobile/app/(screens)/series-detail.tsx`
**Line:** 53, 239
**Severity:** P3 — POTENTIAL DATA MISMATCH
**Code:**
```tsx
interface SeriesDetail {
  followerCount: number;  // Singular
}
```
**Problem:** The Prisma `Series` model uses `followersCount` (plural). The interface uses `followerCount` (singular). If the API returns the Prisma field name directly, the count will be `undefined`. The backend service may transform the name, so this needs verification.

### Finding 32: series-discover.tsx — Same followerCount vs followersCount concern
**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Line:** 51
**Severity:** P3 — POTENTIAL DATA MISMATCH
**Code:**
```tsx
interface SeriesItem {
  followerCount: number;  // Singular, Prisma uses followersCount
}
```

### Finding 33: playlists/[channelId].tsx — Dead styles (header, backBtn, headerTitle, headerRight)
**File:** `apps/mobile/app/(screens)/playlists/[channelId].tsx`
**Lines:** 190-206
**Severity:** P3 — DEAD CODE
**Code:**
```tsx
header: { ... },
backBtn: { ... },
headerTitle: { ... },
headerRight: { ... },
```
**Problem:** These 4 style definitions are unused. The screen uses `GlassHeader` instead of a custom header, but the old manual header styles were never cleaned up.

### Finding 34: playlists/[channelId].tsx — Conditional early return before hooks (React rules violation risk)
**File:** `apps/mobile/app/(screens)/playlists/[channelId].tsx`
**Lines:** 32-47
**Severity:** P3 — REACT RULES VIOLATION RISK
**Code:**
```tsx
if (!channelId) {
  return ( /* error state */ );
}

// Fetch playlists
const playlistsQuery = useInfiniteQuery({ ... });
```
**Problem:** The early return on line 32 happens BEFORE the `useInfiniteQuery` hook on line 50. React's rules of hooks require that hooks are called unconditionally. If `channelId` toggles between truthy and falsy, this will crash with "Rendered more hooks than during the previous render."

### Finding 35: playlist/[id].tsx — Unnecessary `removeClippedSubviews={true}` on short lists
**File:** `apps/mobile/app/(screens)/playlist/[id].tsx`
**Line:** 213
**Severity:** P3 — MINOR
**Problem:** `removeClippedSubviews={true}` is set but playlist item lists are typically short (10-50 items). This optimization mainly helps for very long lists (1000+) and can cause rendering bugs (blank items) on iOS.

### Finding 36: channel/[handle].tsx — `navigation` in useCallback dep but `router` used in body
**File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
**Line:** 131
**Severity:** P3 — INCORRECT DEPENDENCY
**Code:**
```tsx
const handleChannelPress = useCallback((channel: BroadcastChannelWithSubscription) => {
  router.push(`/(screens)/broadcast/${channel.id}` as never);
}, [navigation]);  // <-- depends on `navigation` but uses `router`
```
**Problem:** The dependency array references `navigation` but the function body uses `router`. The dep should be `[router]`.

### Finding 37: channel/[handle].tsx — subscribersCount.toLocaleString() crash risk
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Line:** 353
**Severity:** P3 — DEFENSIVE CODING
**Code:**
```tsx
<Text style={styles.statNumEnhanced}>{channel?.subscribersCount.toLocaleString() || '0'}</Text>
```
**Problem:** If `subscribersCount` is `undefined` or `null`, `.toLocaleString()` will throw. Should use optional chaining: `channel?.subscribersCount?.toLocaleString() ?? '0'`.

### Finding 38: channel/[handle].tsx — More button is a no-op (no onPress handler)
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Lines:** 93-95 (VideoCard component)
**Severity:** P3 — STUB
**Code:**
```tsx
<Pressable style={styles.moreButton} hitSlop={8}>
  <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
</Pressable>
```
**Problem:** The "more" button on each video card has no `onPress` handler.

### Finding 39: edit-channel.tsx — No dirty state tracking
**File:** `apps/mobile/app/(screens)/edit-channel.tsx`
**Severity:** P3 — UX
**Problem:** The screen doesn't track whether the form has been modified. If the user taps back without saving, changes are silently discarded. Should show a confirmation dialog.

### Finding 40: create-playlist.tsx — Icon "file-text" not in documented 44 valid names
**File:** `apps/mobile/app/(screens)/create-playlist.tsx`
**Line:** 163
**Severity:** P3 — ICON RISK
**Code:**
```tsx
<Icon name="file-text" size="sm" color={colors.gold} />
```
**Problem:** `file-text` is not listed in the 44 documented valid icon names in CLAUDE.md, but checking Icon.tsx confirms it IS registered (line 36/130). This is a documentation gap, not a code bug.

### Finding 41: save-to-playlist.tsx — Hardcoded English in Alert
**File:** `apps/mobile/app/(screens)/save-to-playlist.tsx`
**Line:** 110
**Severity:** P3 — i18n
**Code:**
```tsx
Alert.alert('Error', `Could not update playlist: ${message}`);
```
**Problem:** Hardcoded "Error" and "Could not update playlist" should use `t()`.

### Finding 42: channel/[handle].tsx — ListHeader is JSX element in useMemo (not a component)
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Line:** 281
**Severity:** P3 — PERFORMANCE
**Problem:** `ListHeader` is a JSX element (`useMemo(() => <View>...</View>, [deps])`), not a component function. When used as `ListHeaderComponent={ListHeader}`, React treats it as an element which means it cannot be independently reconciled. For optimal FlatList performance, `ListHeaderComponent` should be a component function, not a pre-rendered element.

---

## Summary Statistics

| Severity | Count | Key Themes |
|----------|-------|------------|
| P0 — Ship Blocker | 4 | Empty screen on mount, broken API URLs, duplicate screens, stub features |
| P1 — Major Bug | 9 | Query key mismatch, wrong field names, useMemo side effects, N+1 queries |
| P2 — Functional | 17 | Duplicate imports (6), i18n violations (5), stale closures, type safety |
| P3 — Polish | 12 | Dead code, dep arrays, defensive coding, UX nits |
| **Total** | **42** | |

## Files Not Found (expected but missing)
- No `create-channel.tsx` screen exists — channel creation happens inline in broadcast-channels.tsx bottom sheet (for broadcast channels) or is not exposed for Minbar channels
- No `episode-detail.tsx` screen — episodes navigate directly to post/reel/video screens
- No `subscribe.tsx` screen — subscription is handled inline on channel screens
