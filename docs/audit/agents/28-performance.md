# Agent #28 — Mobile Performance Audit

**Scope:** FlatList/FlashList screens, main feed tabs, heavy UI components, render path efficiency
**Files audited:** 18 files line-by-line (5 tab screens, 8 components, 5 screen files)
**Total findings:** 47

---

## CRITICAL (Severity: P0) — 3 findings

### 1. Bakra reels missing pagingEnabled/snapToInterval — scroll behavior broken
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 759-773
**Category:** Scroll behavior
**Description:** The Bakra (reels) FlashList has no `pagingEnabled`, `snapToInterval`, or `snapToAlignment` prop. This means reels do NOT snap to full-screen positions when the user scrolls. On TikTok/Instagram Reels, each swipe snaps exactly to one video. Without this, the Bakra feed scrolls freely like a regular list, making it impossible to land cleanly on one reel. This is the most user-visible performance/UX bug on the app.

FlashList does not natively support `pagingEnabled` — the fix requires either switching to `FlatList` with `pagingEnabled` for the vertical reel feed, or adding `snapToInterval={SCREEN_H}` and `snapToAlignment="start"` with `decelerationRate="fast"`.

```tsx
// Current: NO snapping props
<FlashList
  ref={listRef}
  data={reels}
  ...
  estimatedItemSize={SCREEN_H}
/>

// Fix: add snapping
<FlatList  // or use snapToInterval on FlashList if supported
  ...
  pagingEnabled={true}
  // OR: snapToInterval={SCREEN_H} snapToAlignment="start" decelerationRate="fast"
/>
```

### 2. Bakra getItemLayout defined but never passed to FlashList
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 677 (defined), lines 759-773 (FlashList usage)
**Category:** Wasted code / missing optimization
**Description:** `getItemLayout` is defined at line 677 as a `useCallback` that returns `{ length: SCREEN_H, offset: SCREEN_H * index, index }`, but it is never passed to the FlashList component. FlashList uses `estimatedItemSize` instead, which is an estimate. Since all Bakra reels are exactly `SCREEN_H` tall, the precise `getItemLayout` would eliminate layout measurement overhead on scroll. The callback is dead code.

### 3. Bakra renderItem re-creates on every currentIndex change — all reels re-render
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 657-674
**Category:** Unnecessary re-renders
**Description:** The `renderItem` callback depends on `currentIndex` in its dependency array. When the user swipes to a new reel, `currentIndex` changes, which recreates `renderItem`, which causes FlashList to re-render ALL visible reel items (not just the newly active one). This is extremely expensive because each `ReelItem` contains a full `<Video>` component, gesture detectors, animations, and bottom sheets. The `isActive` prop should be handled via a separate mechanism (e.g., a ref or context) rather than forcing all items to re-render.

Additionally, `handleLike`, `handleBookmark`, `handleShare`, `handleComment`, `handleProfilePress`, `handleReport`, `handleNotInterested`, `handleCopyLink` are NOT wrapped in `useCallback`, so they are recreated on every render, further invalidating the `renderItem` dependency array.

```tsx
// Current: renderItem depends on currentIndex + non-memoized handlers
const renderItem = useCallback(({ item, index }) => (
  <ReelItem isActive={index === currentIndex} ... />
), [currentIndex, handleLike, handleBookmark, ...]); // <-- re-created on EVERY swipe
```

---

## HIGH (Severity: P1) — 12 findings

### 4. 23+ inline style objects in Bakra ReelItem hot render path
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 202-414
**Category:** Inline styles
**Description:** The `ReelItem` component (rendered for every visible reel) contains 23+ inline `style={{...}}` objects. Each creates a new object on every render, preventing React's shallow comparison from bailing out. Key offenders:
- Line 202-206: Audio info bar container (5-property inline style)
- Line 208: `style={{ flex: 1, marginLeft: spacing.xs, overflow: 'hidden' }}`
- Line 219-228: Audio disc pressable (9-property inline style with shadow)
- Line 243-248: Trending sound indicator (6-property inline style)
- Line 262: `style={{ position: 'relative' }}`
- Line 281-287: Follow button overlay (5-property inline style)
- Line 291-295, 304-308: Follow/unfollow icon containers
- Line 330: "more" text style
- Line 383, 385-390, 402, 404-410: Duet/Stitch button styles

All should be moved to the `StyleSheet.create` block.

### 5. Minbar tab uses react-native `Image` instead of `expo-image`
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, line 2 (import), lines 92, 278
**Category:** Image performance
**Description:** The Minbar tab imports `Image` from `react-native` rather than `expo-image`. `expo-image` provides:
- Built-in memory and disk caching
- Progressive loading and blurhash placeholders
- Better performance with recycling
- `contentFit` instead of `resizeMode`

The `VideoCard` component renders thumbnails for every video in the feed using the uncached RN `Image`. This means every scroll causes re-downloads. The `ThreadCard` and `PostMedia` components correctly use `expo-image`.

### 6. Bakra tab also uses react-native `Image`
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 2 (import), line 233
**Category:** Image performance
**Description:** Same issue as #5. The Bakra tab imports `Image` from `react-native` for the audio cover image inside `ReelItem`. While only a 14x14 image, it's rendered for every reel in the feed.

### 7. MessageBubble not wrapped in React.memo — every message re-renders on any change
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 360
**Category:** Missing memo
**Description:** `MessageBubble` is defined as `function MessageBubble(...)` without `memo()`. It is the primary list item component for the messaging screen, rendered inside a FlatList for potentially hundreds of messages. Any state change in the parent (typing indicator, new message, scroll position) causes ALL visible MessageBubble instances to re-render. This is one of the heaviest screens in the app.

### 8. Conversation renderItem is inline — recreated every render
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 1412-1454
**Category:** Inline renderItem
**Description:** The conversation FlatList's `renderItem` is defined inline (not wrapped in `useCallback`). It also closes over many parent variables (`user`, `convoQuery.data`, `decryptedContents`, `deliveredMessages`, `searchQuery`, `newMessageIdsRef`). Every parent render recreates this function, and since `MessageBubble` is not memoized (#7), every message re-renders.

### 9. PostMedia not wrapped in React.memo
**File:** `apps/mobile/src/components/saf/PostMedia.tsx`, line 16
**Category:** Missing memo
**Description:** `PostMedia` is defined as `export function PostMedia(...)` without `memo()`. It is rendered inside every `PostCard` in the Saf feed. When `PostCard` re-renders (e.g., local like state change), `PostMedia` unnecessarily re-renders even though its props (mediaUrls, mediaTypes) haven't changed.

### 10. ActionButton not wrapped in React.memo
**File:** `apps/mobile/src/components/ui/ActionButton.tsx`, line 28
**Category:** Missing memo
**Description:** `ActionButton` is defined as `export function ActionButton(...)` without `memo()`. It is used 4-6 times in every `PostCard` and `ThreadCard`. When any post/thread card re-renders, all ActionButtons re-render. Since each ActionButton creates animated values via `useSharedValue`, this is wasteful.

### 11. CommentsSheet not wrapped in React.memo
**File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`, line 33
**Category:** Missing memo
**Description:** `CommentsSheet` is a complex component (comment list + input) that is not memoized. It's rendered inside the Bakra screen and receives `reel` as a prop. When the parent re-renders (e.g., `heartTrigger` state change), `CommentsSheet` re-renders unnecessarily.

### 12. ExploreGridItem not wrapped in React.memo
**File:** `apps/mobile/app/(screens)/discover.tsx`, line 218
**Category:** Missing memo
**Description:** `ExploreGridItem` is defined without `memo()` and is the grid item for the Discover screen's 3-column grid. Every item re-renders when the parent re-renders.

### 13. GridItem (profile) not wrapped in React.memo
**File:** `apps/mobile/app/(screens)/profile/[username].tsx`, line 44
**Category:** Missing memo
**Description:** `GridItem` renders each post thumbnail in the profile grid. It is not memoized. Each `GridItem` creates a `useSharedValue` and `useAnimatedStyle` on every render, wasting animation resources.

### 14. Conversation screen has 30+ inline style objects
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 345-1848
**Category:** Inline styles
**Description:** The conversation screen has 30+ inline `style={{...}}` objects throughout the message rendering path, including inside `MessageBubble` (lines 422, 453, 495, 497, 510, 527, 559, 562, 577, 579, 613, 615) and in the parent screen (lines 1269, 1287, 1358, 1369, 1374-1376, 1386, 1394-1398, 1517-1519, 1530-1543). Each creates new objects on every render.

### 15. handleViewableItemsChanged captures stale `reels` array
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 509-535
**Category:** Stale closure / re-render cascade
**Description:** `handleViewableItemsChanged` has `reels` in its dependency array. When new reels are fetched (infinite scroll), the `reels` array changes, recreating `handleViewableItemsChanged`. FlashList treats `onViewableItemsChanged` changes as a config change, potentially causing layout recalculation. The `reels` array should be accessed via a ref instead.

---

## MEDIUM (Severity: P2) — 18 findings

### 16. FEED_TABS/TABS arrays recreated every render
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 215-218; `majlis.tsx`, lines 83-88; `risalah.tsx`, lines 174-177
**Category:** Unnecessary allocation
**Description:** `FEED_TABS` and `TABS` arrays are created inside the component body on every render because they call `t()` for labels. These should be memoized with `useMemo` depending on `t`.

### 17. AnimatedThreadCard stagger animation fires on every FlashList recycle
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, lines 43-71
**Category:** Unnecessary animation
**Description:** `AnimatedThreadCard` runs a stagger entrance animation in `useEffect` keyed on `[index]`. When FlashList recycles a cell, the component remounts with a new index, causing the fade-in animation to replay. After the initial load, recycled cells should not animate. The animation should only fire once on mount, not on index change.

### 18. Bakra doubleTapGesture recreated every render
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 646-655
**Category:** Missing useMemo
**Description:** `doubleTapGesture` is created with `Gesture.Tap()` on every render (not memoized). It captures `reels[currentIndex]`, `haptic`, and `handleLike` which change frequently. This means a new gesture object is passed to every `ReelItem` on every render.

### 19. Bakra ReelItem's useUser() hook inside list item
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 122
**Category:** Unnecessary hook in list item
**Description:** `ReelItem` (memo'd) calls `useUser()` at line 122, creating a subscription to the Clerk user object. This hook triggers re-renders across all mounted `ReelItem` instances whenever the user object changes (e.g., token refresh). The user ID should be passed as a prop instead.

### 20. Bakra ReelItem's useQueryClient() hook inside list item
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 126
**Category:** Unnecessary hook in list item
**Description:** `ReelItem` calls `useQueryClient()` at line 126. While lightweight, it creates a subscription. The query client should be accessed via callback props from the parent.

### 21. Bakra ReelItem's useRouter() hook inside list item
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 128
**Category:** Unnecessary hook in list item
**Description:** `ReelItem` calls `useRouter()` at line 128. Router should be passed from the parent or navigation handled via callback props.

### 22. Bakra ReelItem creates a followMutation inside list item
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 129-134
**Category:** Heavy hook in list item
**Description:** Each `ReelItem` creates its own `useMutation` for follow. This means every reel item in the feed has an independent mutation instance. This should be lifted to the parent and passed as a callback.

### 23. Bakra listEmpty/listFooter not memoized
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 683-701
**Category:** Missing useMemo
**Description:** `listEmpty` and `listFooter` are defined as expressions (not wrapped in `useMemo`). They are recreated on every render and passed as `ListEmptyComponent`/`ListFooterComponent`.

### 24. Majlis AnimatedThreadCard calls useTranslation() inside list item
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 63
**Category:** Unnecessary hook in list item
**Description:** `AnimatedThreadCard` calls `useTranslation()` inside the memoized list item component just to get `isRTL` for the engagement glow border. This creates a subscription to the i18n context in every list item. `isRTL` should be passed as a prop.

### 25. Only 2 FlatLists in the entire app use windowSize tuning
**File:** `apps/mobile/app/(tabs)/risalah.tsx` (line 481), `apps/mobile/src/components/ui/ImageCarousel.tsx` (line 110)
**Category:** Missing optimization
**Description:** Out of 100+ FlatList/FlashList instances across the app, only 2 specify `windowSize`. The default `windowSize` of 21 renders content 10 viewports above and below the visible area. For heavy list items (PostCard, ThreadCard, VideoCard), reducing `windowSize` to 5-7 would significantly reduce memory usage and render time.

### 26. Only 2 FlatLists use maxToRenderPerBatch
**File:** `apps/mobile/app/(tabs)/risalah.tsx` (line 480), `apps/mobile/src/components/ui/ImageCarousel.tsx` (line 109)
**Category:** Missing optimization
**Description:** Only 2 lists specify `maxToRenderPerBatch`. The default of 10 means the JS thread renders 10 items per frame on initial load. For complex items like PostCard or VideoCard, this causes frame drops. Setting `maxToRenderPerBatch={5}` (or lower) would spread rendering across more frames.

### 27. Dimensions.get('window') called at module scope in 30+ files
**File:** Multiple files (bakra.tsx, discover.tsx, profile/[username].tsx, and 27+ others)
**Category:** Static dimensions
**Description:** `Dimensions.get('window')` is called at module scope (outside components) in 30+ files. This captures the window dimensions at import time and never updates on device rotation or split-screen. While the app may be portrait-locked, this is fragile. Components that need responsive dimensions should use `useWindowDimensions()` hook instead.

### 28. Saf feed's suggestedUsers dependency causes useMemo invalidation
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 288-303
**Category:** Unstable dependency
**Description:** The `feedItems` useMemo at line 290 depends on `suggestedUsers` (line 288), which is computed from `suggestedQuery.data` filtered by `dismissedUserIds`. Since `dismissedUserIds` is a `Set` (created fresh via `new Set([...prev, userId])`), the reference changes on every dismissal, recomputing `feedItems` and causing a FlashList data update.

### 29. Risalah renderItem closes over onlineUsers and typingUsers Sets/Maps
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 336-366
**Category:** Unstable closure
**Description:** The Risalah `renderItem` callback depends on `onlineUsers` (Set) and `typingUsers` (Map). These are replaced with new instances on every socket event (`setOnlineUsers(prev => new Set(prev).add(userId))`), causing `renderItem` to be recreated and all conversation rows to re-render on every online/offline/typing event.

### 30. Minbar listHeader useMemo has unstable dependencies
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 258-325
**Category:** Unstable useMemo
**Description:** The Minbar `listHeader` useMemo depends on `haptic` and `continueWatchingQuery.data`. The `haptic` object is created via `useHaptic()` on every render (returns a new object). This invalidates the `listHeader` memo on every render, defeating its purpose.

### 31. Minbar handleVideoPress/handleChannelPress/handleMorePress not memoized
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 222-235
**Category:** Missing useCallback
**Description:** `handleVideoPress`, `handleChannelPress`, and `handleMorePress` are plain functions (not wrapped in `useCallback`). They are passed to `renderVideoItem` via the `useCallback` at line 247, but since they are recreated on every render, the `renderVideoItem` useCallback's dependency array is invalidated on every render, making the `useCallback` useless.

### 32. Minbar VideoCard receives RN Image for thumbnails without caching
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 91-93, 278-280
**Category:** Image caching
**Description:** Video thumbnails are rendered with `<Image source={{ uri: video.thumbnailUrl }} />` (react-native Image). On infinite scroll, previously rendered thumbnails that scroll off-screen are not cached — when the user scrolls back up, they must be re-downloaded. `expo-image` with its disk cache would eliminate this.

### 33. PostCard `entering={FadeInUp.duration(400).springify()}` on every card
**File:** `apps/mobile/src/components/saf/PostCard.tsx`, line 211
**Category:** Unnecessary animation
**Description:** Every PostCard plays a `FadeInUp` entrance animation. When the FlashList recycles cells on scroll, recycled PostCards fade in again. This creates a constant ripple of animations as the user scrolls, which is distracting and wastes animation resources. Entrance animations should only play once on initial feed load.

---

## LOW (Severity: P3) — 14 findings

### 34. ThreadCard `entering={FadeInUp.duration(400).springify()}` on every card
**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`, line 173
**Category:** Unnecessary animation
**Description:** Same as #33 but for ThreadCard. Every thread card plays entrance animation on recycle.

### 35. formatDistanceToNowStrict called in render path of PostCard and ThreadCard
**File:** `apps/mobile/src/components/saf/PostCard.tsx`, line 206; `majlis/ThreadCard.tsx`, line 168
**Category:** Computation in render
**Description:** `formatDistanceToNowStrict(new Date(...))` is called on every render of every list item. While not expensive individually, it creates a new `Date` object and performs locale formatting for every card. Should be memoized or computed once and passed as a prop.

### 36. VideoPlayer calls Dimensions.get inside render
**File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`, line 239
**Category:** Computation in render
**Description:** `Dimensions.get('window').width` and `.height` are called inside the render body (inside the loading skeleton JSX). This should use `useWindowDimensions()` or be computed once.

### 37. ImageCarousel onScroll handler not memoized
**File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, lines 38-44
**Category:** Missing useCallback
**Description:** The `onScroll` handler is a plain function, recreated on every render. While passed to FlatList which may not re-render on this change, it's still best practice to memoize scroll handlers.

### 38. ImageCarousel renderItem not memoized
**File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, lines 50-64
**Category:** Missing useCallback
**Description:** The `renderItem` function is defined inline and not memoized. Each render creates a new function reference.

### 39. StoryRow imports are malformed (syntax concern)
**File:** `apps/mobile/src/components/saf/StoryRow.tsx`, lines 1-4
**Category:** Import anomaly
**Description:** Lines 1-4 show unusual imports: `import { memo, FlatList, View, StyleSheet } from 'react-native'` and `import { memo, useUser } from '@clerk/clerk-expo'` — `memo` is imported multiple times from wrong packages. This may be a rendering artifact, but if real, it shadows React.memo with undefined values.

### 40. FloatingHearts uses module-level mutable counter
**File:** `apps/mobile/src/components/ui/FloatingHearts.tsx`, line 28
**Category:** Module-level state
**Description:** `let nextId = 0` is a module-level mutable variable. This works but is a shared mutable state anti-pattern. If multiple `FloatingHearts` instances exist simultaneously (which they do — one per visible ReelItem in Bakra), they share the counter.

### 41. Profile GridItem inline style for collab badge
**File:** `apps/mobile/app/(screens)/profile/[username].tsx`, lines 79-83
**Category:** Inline styles
**Description:** `GridItem` has an inline `style={{...}}` for the collaborator badge (position absolute, 5 properties). This is inside a grid item rendered for every post.

### 42. Saf listHeader useMemo has feedTypeAnimStyle dependency
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 382
**Category:** Unstable useMemo dependency
**Description:** `listHeader` useMemo includes `feedTypeAnimStyle` in its dependencies. `feedTypeAnimStyle` is an animated style that technically creates a new reference (via `useAnimatedStyle`). However, Reanimated animated styles are stable references, so this is minor.

### 43. ConversationRow creates useSharedValue per row
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 111-114
**Category:** Animation overhead in list items
**Description:** `ConversationRow` (memoized) creates a `useSharedValue` and `useAnimatedStyle` for a scale press animation. While Reanimated handles this efficiently on the UI thread, creating animation nodes for every conversation row adds overhead.

### 44. ReadReceiptIcon creates inline style with spread
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 345
**Category:** Inline style with spread
**Description:** `ReadReceiptIcon` creates `style={{ flexDirection: rtlFlexRow(isRTL), ...rtlMargin(isRTL, 4, 0) }}` which spreads an object into an inline style on every render.

### 45. Minbar skeleton loading creates inline styles in useMemo
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 342-350
**Category:** Inline styles in skeleton
**Description:** The loading skeleton inside `listEmpty` useMemo creates inline styles: `style={{ marginBottom: spacing.lg }}`, `style={{ flexDirection: 'row', ... }}`, `style={{ flex: 1, ... }}`. While inside useMemo, these still create new objects when the memo is recomputed.

### 46. Saf suggestedUsers filter runs on every render
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 288
**Category:** Unmemoized computation
**Description:** `suggestedUsers` is computed as `(suggestedQuery.data ?? []).filter(...)` outside useMemo. This filter runs on every render, even when neither the data nor dismissedUserIds have changed.

### 47. useVideoPreloader creates new Maps on every state update
**File:** `apps/mobile/src/hooks/useVideoPreloader.ts`, lines 31-36
**Category:** Unstable state updates
**Description:** `updateState` creates `new Map(prev)` on every call. When `onViewableChange` calls `preloadSingle` for 3 URLs, it triggers 3 state updates, each creating a new Map. This causes 3 re-renders of the Bakra screen. Consider batching or using a ref instead of state for load states that don't need to trigger renders.

---

## Summary by Category

| Category | Count | Severity |
|----------|-------|----------|
| Missing pagingEnabled/snap (Bakra) | 1 | P0 |
| Inline styles in hot render paths | 4 | P1/P2 |
| Missing React.memo on list items | 5 | P1 |
| Inline/non-memoized renderItem | 3 | P0/P1 |
| Unnecessary hooks in list items | 4 | P2 |
| Missing useCallback on handlers | 4 | P2 |
| Unstable useMemo dependencies | 4 | P2 |
| Missing windowSize/maxToRenderPerBatch | 2 | P2 |
| react-native Image instead of expo-image | 3 | P1/P2 |
| Unnecessary entrance animations on recycle | 3 | P2/P3 |
| Dimensions.get at module scope | 1 | P2 |
| Animation overhead in list items | 2 | P3 |
| Other (formatDate in render, module state) | 11 | P3 |

## Top 5 Fixes by Impact

1. **Add pagingEnabled to Bakra** — Without this, the entire reels experience is broken. Users cannot snap between videos.
2. **Extract Bakra renderItem deps from currentIndex** — This single change would prevent ALL reel items from re-rendering on every swipe. Use a ref for currentIndex and make isActive reactive via a separate mechanism.
3. **Wrap MessageBubble in React.memo** — The conversation screen is the most-used screen. Memoizing MessageBubble would prevent hundreds of unnecessary re-renders on every message/typing event.
4. **Move inline styles to StyleSheet in Bakra ReelItem** — 23+ inline objects in the hottest render path of the app.
5. **Switch Minbar/Bakra from RN Image to expo-image** — Free performance win: disk caching, progressive loading, memory management.
