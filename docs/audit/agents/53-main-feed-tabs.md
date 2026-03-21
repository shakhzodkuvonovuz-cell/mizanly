# Agent #53 — Main Feed Tab Screens Deep Audit

**Scope:** All 7 files in `apps/mobile/app/(tabs)/`
- `_layout.tsx` (tab bar configuration)
- `saf.tsx` (Instagram-like feed)
- `majlis.tsx` (Twitter-like threads)
- `risalah.tsx` (WhatsApp-like messaging)
- `bakra.tsx` (TikTok-like reels)
- `minbar.tsx` (YouTube-like long video)
- `create.tsx` (create screen redirect)

**Methodology:** Line-by-line read of every file, cross-referenced with store types, Icon component valid names, theme tokens, API service methods, and ScreenErrorBoundary source.

---

## TIER 0 — Ship Blockers

### Finding 53-001: ScreenErrorBoundary crashes when it catches an error — `t()` undefined in class component
**File:** `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx`, line 46
**Code:**
```tsx
title={t('common.error')}
```
**Problem:** `ScreenErrorBoundary` is a **class component** (extends `Component`). It imports `useTranslation` (a hook) at line 2 but **never calls it** — hooks cannot be called inside class components. The `t` function referenced at line 46 is **not defined** in the class scope. When any error occurs in any of the 5 tab screens, `ScreenErrorBoundary.render()` attempts to call `t('common.error')` which throws `ReferenceError: t is not defined`, causing a **secondary crash** in the error boundary itself. This means the error boundary is worse than useless — it transforms a caught error into an uncatchable crash.

All 7 tab files wrap their content in `<ScreenErrorBoundary>`, so this affects every main screen in the app:
- `saf.tsx` line 417
- `majlis.tsx` line 201
- `risalah.tsx` line 374
- `bakra.tsx` line 704
- `minbar.tsx` line 374
- `create.tsx` line 12
- `_layout.tsx` does NOT use it (correct — the layout wraps the tabs)

**Impact:** CRITICAL. Any runtime error on any tab screen causes a double-crash with no recovery. User sees a white screen or app crash instead of a retry UI.
**Fix:** Either (a) hardcode the English string instead of using `t()`, or (b) wrap the class component's render fallback in a functional component that can call `useTranslation()`, or (c) use `i18next.t()` directly (non-hook API).

Additionally, line 48 has a hardcoded English string `"Try again"` for `actionLabel`, which confirms the i18n approach was never completed:
```tsx
actionLabel="Try again"
```

---

### Finding 53-002: No API error state on any of the 5 tab screens
**Files:** All tab screens
**Problem:** None of the 5 feed tab screens handle `feedQuery.isError` or display an error state when the API call fails. The pattern across all tabs is:
- `ListEmptyComponent` checks `feedQuery.isLoading` to show skeleton, otherwise shows `EmptyState` for "no content"
- There is NO check for `feedQuery.isError` or `feedQuery.error`

When the API is down, returns 500, or the user has no network, the user sees the **"no content" empty state** (e.g., "No posts yet" / "Follow people to see their posts") instead of a meaningful error message with retry.

**Specific locations:**
- `saf.tsx` lines 384-400: checks `isLoading`, else shows "Follow people" empty state
- `majlis.tsx` lines 143-160: checks `isLoading`, else shows "Start a thread" empty state
- `risalah.tsx` lines 294-315: checks `isLoading`, else shows "Your conversations" empty state
- `bakra.tsx` lines 683-695: checks `isLoading`, else shows "No reels" empty state
- `minbar.tsx` lines 327-363: checks `isLoading` or `feedType`, else shows "No videos" empty state

**Impact:** HIGH. Users who have network errors or see API failures will think the app has no content, not that there's a connectivity issue. No "retry" affordance is shown.
**Fix:** Add `feedQuery.isError` check before the empty-data check in each `ListEmptyComponent`, showing an error-specific `EmptyState` with a retry action that calls `feedQuery.refetch()`.

---

### Finding 53-003: Majlis `video` tab key not in store type — silently drops selection
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, lines 83-88 and 239
**Code at line 87:**
```tsx
{ key: 'video', label: t('majlis.video') },
```
**Code at line 239:**
```tsx
onTabChange={(key) => setFeedType(key as 'foryou' | 'following' | 'trending')}
```
**Store type** (store/index.ts line 31):
```tsx
majlisFeedType: 'foryou' | 'following' | 'trending';
```
**Problem:** The TABS array includes a `video` key, but the store type for `majlisFeedType` only accepts `'foryou' | 'following' | 'trending'`. When the user taps the "Video" tab, the `onTabChange` callback casts the key to `'foryou' | 'following' | 'trending'`, but the actual value is `'video'` — a string the store type does not accept. TypeScript `as` casting suppresses the error at compile time.

Then at lines 124-126:
```tsx
const type = feedType === 'video' ? 'foryou' : feedType;
return threadsApi.getFeed(type as 'foryou' | 'following' | 'trending', pageParam as string | undefined);
```
The `video` tab falls back to fetching the `foryou` feed, then client-side filters for video content at lines 139-141:
```tsx
const threads = feedType === 'video'
  ? allThreads.filter((t) => t.mediaTypes?.some((mt: string) => mt.startsWith('video')))
  : allThreads;
```

**Impact:** MEDIUM. The video tab works functionally (client-side filter), but the TypeScript type is wrong — the store could reject `'video'` in strict mode. The client-side filter also means the user may see an empty list even when video threads exist on page 2+ (since only fetched pages are filtered).
**Fix:** Add `'video'` to the `majlisFeedType` union type in the store, or create a separate local state for the video filter.

---

## TIER 1 — Critical Functional Issues

### Finding 53-004: Risalah tab has no search functionality
**File:** `apps/mobile/app/(tabs)/risalah.tsx`
**Problem:** The Risalah (messaging) tab has no search bar or search button in the header. Users cannot search through their conversations. Compare with the Saf tab (has search icon at line 440), Majlis (has search icon at line 225), Bakra (has search icon at line 712), and Minbar (has search icon at line 382). The Risalah header (lines 377-404) has: saved messages, call history, and new conversation — but no search.

This is a significant gap compared to WhatsApp, Telegram, and every major messaging app, all of which have conversation search as a primary affordance.

**Impact:** HIGH. Users with many conversations have no way to find a specific chat.
**Fix:** Add a search icon to the header that navigates to a conversation search screen, or add an inline search bar at the top of the conversation list.

---

### Finding 53-005: Bakra (TikTok reels) has no snap-to-item scrolling behavior
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 759-773
**Code:**
```tsx
<FlashList
  ref={listRef}
  data={reels}
  ...
  estimatedItemSize={SCREEN_H}
  ...
/>
```
**Problem:** The FlashList for reels does not have `pagingEnabled`, `snapToInterval`, or `snapToAlignment` props. TikTok-style full-screen reels require snap scrolling so each reel fills the viewport exactly. Without it, the user can land between two reels with half of each visible. FlashList does not natively support `pagingEnabled` like FlatList — it needs `snapToInterval={SCREEN_H}` or a custom scroll handler.

Note: The `viewabilityConfig` at line 767 only controls when `onViewableItemsChanged` fires, not the scroll physics.

**Impact:** HIGH. The core TikTok-like experience is broken — scrolling between reels is imprecise and feels janky.
**Fix:** Add `snapToInterval={SCREEN_H}` and `decelerationRate="fast"` to the FlashList, or switch to a FlatList with `pagingEnabled={true}`.

---

### Finding 53-006: Bakra reels — doubleTapGesture is shared across all ReelItems
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 646-655 and 657-674
**Code:**
```tsx
const doubleTapGesture = Gesture.Tap()
  .numberOfTaps(2)
  .onEnd(() => {
    haptic.medium();
    const reel = reels[currentIndex];
    if (reel && !reel.isLiked) {
      handleLike(reel);
    }
    setHeartTrigger((prev) => prev + 1);
  });
```
This gesture is created once in the parent `BakraScreen` and passed to **every** `ReelItem` via the `doubleTapGesture` prop. But the gesture handler's `onEnd` callback always reads `reels[currentIndex]` from the parent scope — it does NOT use the individual `item` passed to each `ReelItem`.

This means:
1. The gesture object is shared across all rendered items. React Native Gesture Handler expects each `GestureDetector` to have its own gesture instance.
2. Even if the gesture fires on a specific item, it always likes `reels[currentIndex]` which may differ from the tapped item.

**Impact:** MEDIUM. Double-tapping a reel that is partially visible (not the "current" one) will like the wrong reel.
**Fix:** Create the gesture inside each `ReelItem` using its own `item` prop, not `reels[currentIndex]`.

---

### Finding 53-007: Bakra reels — heartTrigger prop causes all ReelItems to re-render on every like
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 654, 672
**Code:**
```tsx
setHeartTrigger((prev) => prev + 1);  // line 654
```
```tsx
heartTrigger={heartTrigger}  // line 672, passed to every ReelItem
```
**Problem:** `heartTrigger` is a counter incremented on every double-tap like. It's passed as a prop to ALL `ReelItem` components via the `renderItem` callback. Since `heartTrigger` changes on every like, the `renderItem` callback's dependency array changes, causing ALL visible reels to re-render (including their video players). This defeats the purpose of `memo()` on `ReelItem`.

Additionally, the `FloatingHearts` component at line 458 receives `heartTrigger` inside every `ReelItem`, so hearts animate on ALL visible reels, not just the one that was liked.

**Impact:** MEDIUM. Performance degradation — every double-tap triggers full re-render of all visible reel video players.
**Fix:** Move `heartTrigger` to be per-item (e.g., track which reel ID was liked), or use a ref-based approach that doesn't cause re-renders.

---

### Finding 53-008: Bakra logo missing fontFamily
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 800-805
**Code:**
```tsx
logo: {
  color: colors.emerald,
  fontSize: fontSize.xl,
  fontWeight: '700',
  letterSpacing: -0.5,
},
```
**Problem:** The Bakra tab logo text at line 708 (`<Text style={...}>Bakra</Text>`) uses the `styles.logo` which does NOT include `fontFamily: 'PlayfairDisplay_700Bold'`. Compare with:
- Saf: `fontFamily: 'PlayfairDisplay_700Bold'` (line 529)
- Majlis: `fontFamily: 'PlayfairDisplay_700Bold'` (line 328)
- Minbar: `fontFamily: 'PlayfairDisplay_700Bold'` (line 488)
- Risalah: `fontFamily: 'PlayfairDisplay_700Bold'` (line 516)

The Bakra tab is the only one missing the brand font on its logo.

**Impact:** LOW. Visual inconsistency — the Bakra logo renders in the system default font instead of the brand's Playfair Display.
**Fix:** Add `fontFamily: 'PlayfairDisplay_700Bold'` to the `logo` style in bakra.tsx.

---

## TIER 2 — Data Integrity / Logic Issues

### Finding 53-009: `_layout.tsx` — `unreadNotifications` read from store but never used
**File:** `apps/mobile/app/(tabs)/_layout.tsx`, line 156
**Code:**
```tsx
const unreadNotifications = useStore(s => s.unreadNotifications);
```
**Problem:** `unreadNotifications` is read from the Zustand store but is never passed to any `TabIcon` component and never used anywhere in the layout. The Saf tab icon does NOT show a notification badge — only the Risalah tab shows `unreadMessages`. This is dead code that causes an unnecessary re-render of the entire tab bar every time the notification count changes.

**Impact:** LOW (performance). The tab bar re-renders on every notification count change for no visual effect.
**Fix:** Either remove the unused variable, or pass it as a `badge` prop to the Saf tab's `TabIcon` to show notification count.

---

### Finding 53-010: Saf feed — `feedQuery.placeholderData` always returns `undefined`
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 279-282
**Code:**
```tsx
placeholderData: () => {
  // Show cached data immediately while fetching fresh data
  return undefined;
},
```
**Problem:** The `placeholderData` callback has a comment saying "Show cached data immediately" but the implementation always returns `undefined`. The `feedCache.set()` call at line 273 writes to a custom cache, but this custom cache is never read back as `placeholderData`. The intended stale-while-revalidate pattern is not implemented.

**Impact:** LOW. No offline/stale data is shown — the user always sees the loading skeleton on cold start, even if cached data exists.
**Fix:** Read from `feedCache.get(CACHE_KEYS.SAF_FEED + ':' + feedType)` in the `placeholderData` callback.

---

### Finding 53-011: Saf — `listHeader` useMemo includes `FEED_TABS` which is recreated every render
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 215-218 and 348-382
**Code:**
```tsx
const FEED_TABS = [
  { key: 'following', label: t('saf.following') },
  { key: 'foryou', label: t('saf.forYou') },
];
```
**Problem:** `FEED_TABS` is declared inside the component function body (not memoized), so it creates a new array reference every render. It's used inside `listHeader` which is memoized with `useMemo`, but since `FEED_TABS` is not in the dependency array and is not stable, the `TabSelector` gets a new `tabs` prop reference only when the memo invalidates for other reasons. This is inconsistent — either `FEED_TABS` should be memoized or moved outside the component.

**Impact:** NEGLIGIBLE. React's shallow comparison in `TabSelector` likely handles this fine since the individual objects are new anyway.

---

### Finding 53-012: Saf — `listEmpty` useMemo is missing `t` in dependency array
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 400
**Code:**
```tsx
), [feedQuery.isLoading, router, t]);
```
Actually, `t` IS in the dependency array here. Let me check Majlis and Risalah.

**File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 160
**Code:**
```tsx
), [feedQuery.isLoading, router]);
```
**Problem:** The `listEmpty` memo uses `t()` for translations at lines 154-157 but `t` is NOT in the dependency array. If the language changes while the app is running, the empty state will show stale translations.

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 315
**Code:**
```tsx
), [isLoading, activeTab, router]);
```
**Problem:** Same issue — `t` is used at lines 305-312 but missing from deps.

**Impact:** LOW. Language changes at runtime are rare, but the pattern is wrong.
**Fix:** Add `t` to the dependency arrays.

---

### Finding 53-013: Risalah — `listHeader` useMemo missing `isRTL` and `t` in dependency array
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 317-333
**Code:**
```tsx
const listHeader = useMemo(() => {
  ...
  <Pressable style={[styles.archivedRow, { flexDirection: rtlFlexRow(isRTL) }]} ...>
    ...
    <Text ...>{t('risalah.archived')}</Text>
    ...
    <Icon name={rtlChevron(isRTL, 'forward')} .../>
  </Pressable>
}, [archivedCount, router]);
```
**Problem:** `isRTL` and `t` are used inside the memo but are NOT in the dependency array `[archivedCount, router]`. If the language changes to/from Arabic, the layout direction won't update.

**Impact:** LOW. Same language change edge case.
**Fix:** Add `isRTL` and `t` to the dependency array.

---

### Finding 53-014: Risalah — `renderItem` missing `archiveMutation` and `t` in dependency array
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 366
**Code:**
```tsx
}, [user?.id, router, onlineUsers, typingUsers]);
```
**Problem:** The `renderItem` callback uses `archiveMutation.mutate` at line 343 and `t` (via `ConversationRow` which calls `useTranslation` internally — this is fine since `ConversationRow` is a separate component). But `archiveMutation` is used directly at line 343 and is not in the deps. If the mutation reference changes (unlikely with react-query but technically possible), the rendered archive action could be stale.

**Impact:** NEGLIGIBLE. React Query mutation references are stable.

---

### Finding 53-015: Risalah socket connection does not join conversation rooms
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 197-261
**Problem:** The socket connects and listens for `user_online`, `user_offline`, `user_typing`, and `new_message` events, but it never emits `join_conversation` for any of the user's conversations. Per the Socket.io architecture documented in CLAUDE.md:
```ts
socket.emit('join_conversation', { conversationId })
```
Without joining rooms, the socket will NOT receive `user_typing` events for specific conversations (since typing events are scoped to rooms). The `new_message` event at line 252 may work if the server broadcasts it to user-specific rooms, but `user_typing` won't work.

**Impact:** MEDIUM. The typing indicators shown in the conversation list (TypingDots component) will never actually appear because the socket isn't in any conversation room.
**Fix:** After the conversations list is loaded, emit `join_conversation` for each conversation ID.

---

### Finding 53-016: Risalah — socket reconnection leak on component unmount during async connect
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 197-261
**Code:**
```tsx
useEffect(() => {
  let socket: Socket;
  const connect = async () => {
    const token = await getToken();
    ...
    socket = io(SOCKET_URL, { ... });
    ...
    socketRef.current = socket;
  };
  connect();
  return () => { socket?.disconnect(); };
}, [getToken, queryClient]);
```
**Problem:** The `connect()` function is async. If the component unmounts before `connect()` completes (before `socket = io(...)` runs), the cleanup function `() => { socket?.disconnect(); }` will call `disconnect()` on `undefined` (the outer `let socket` is still `undefined`). Then when the async `connect()` eventually resolves, it creates a socket that is never cleaned up — it will stay connected, receiving events, and calling `setOnlineUsers`/`setTypingUsers` on an unmounted component.

**Impact:** MEDIUM. Memory leak and potential state updates on unmounted component.
**Fix:** Use an `isMounted` flag or AbortController to prevent the socket from being created after unmount.

---

### Finding 53-017: Minbar — `handleVideoPress`, `handleChannelPress`, `handleMorePress` not in useCallback
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 222-235
**Code:**
```tsx
const handleVideoPress = (video: Video) => { ... };
const handleChannelPress = (handle: string) => { ... };
const handleMorePress = (video: Video) => { ... };
```
Then at line 254:
```tsx
), [handleVideoPress, handleChannelPress, handleMorePress]);
```
**Problem:** These handler functions are declared without `useCallback`, creating new function references every render. They are listed in the `renderVideoItem` dependency array, which means `renderVideoItem` (a memoized callback) is recreated every render, defeating the memoization. Every render creates new handler refs -> new `renderVideoItem` -> FlashList re-renders all visible items.

**Impact:** MEDIUM. Performance degradation on the Minbar tab — every state change (e.g., refreshing, category selection) causes all video cards to re-render.
**Fix:** Wrap all three handlers in `useCallback`.

---

### Finding 53-018: Minbar — `handleSaveToWatchLater` is async but error is silently swallowed
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 237-245
**Code:**
```tsx
const handleSaveToWatchLater = async (videoId: string) => {
  haptic.light();
  setSelectedVideoId(null);
  try {
    await usersApi.addWatchLater(videoId);
  } catch {
    // silently fail — user can retry
  }
};
```
**Problem:** When saving to watch later fails, the user receives no feedback — no toast, no error message. The bottom sheet closes immediately, giving the impression the action succeeded. There's no way for the user to know they need to retry.

**Impact:** LOW. Poor UX but not a data integrity issue.
**Fix:** Show a toast notification on failure.

---

## TIER 3 — UI / Styling / Polish Issues

### Finding 53-019: Bakra — massive amount of inline styles throughout ReelItem
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, multiple locations
**Examples:**
- Lines 202-206: inline style object for audio info bar
- Lines 219-229: inline style object for vinyl button
- Lines 231: inline style for spinning view
- Lines 243-248: inline style for trending indicator
- Lines 250: inline style for trending text
- Lines 262: inline style for avatar container
- Lines 281-287: inline style for follow button
- Lines 291-296: inline style for following check view
- Lines 300-307: inline style for follow gradient
- Lines 330: inline style for "more" text
- Lines 383-389: inline style for duet button circle
- Lines 404-409: inline style for stitch button circle

**Problem:** Over 15 inline style objects are created on every render inside the `ReelItem` component. Each creates a new object reference, causing unnecessary reconciliation work. This is especially problematic because `ReelItem` renders for each visible reel in a scrolling list.

**Impact:** MEDIUM. Performance degradation in the most scroll-heavy screen of the app.
**Fix:** Move all inline styles to the `StyleSheet.create()` block at the bottom of the file.

---

### Finding 53-020: Bakra — hardcoded colors throughout inline styles
**File:** `apps/mobile/app/(tabs)/bakra.tsx`
**Examples:**
- Line 209: `color: '#fff'`
- Line 223: `backgroundColor: '#1C1C1E'` (not from theme)
- Line 233: `borderRadius: radius.full` (correct) but `width: 14, height: 14` (hardcoded)
- Line 250: `color: '#fff'`, `fontSize: 9`
- Line 297: `color: '#fff'`
- Line 302: `colors: [colors.emerald, '#05593A']` — `#05593A` is not a theme token
- Line 309: `color: '#fff'`
- Line 330: `color: colors.text.secondary`
- Line 388: `backgroundColor: 'rgba(255,255,255,0.15)'`
- Line 916: `color: '#fff'`

**Problem:** Multiple hardcoded hex colors (`#fff`, `#1C1C1E`, `#05593A`) that should use theme tokens. This breaks the design system consistency and would fail if a light theme were ever implemented.

**Impact:** LOW. Only affects dark mode consistency currently.

---

### Finding 53-021: Minbar header has no RTL support
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 377-430
**Code:**
```tsx
<View style={styles.header}>
  <Text style={styles.logo}>Minbar</Text>
  <View style={styles.headerRight}>
```
**Problem:** The Minbar header uses static `styles.header` with `flexDirection: 'row'` (line 478) without any RTL flip. Compare with:
- Saf: `{ flexDirection: rtlFlexRow(isRTL) }` (line 420)
- Majlis: `{ flexDirection: rtlFlexRow(isRTL) }` (line 204)
- Risalah: `{ flexDirection: rtlFlexRow(isRTL) }` (line 376)
- Bakra: `{ flexDirection: rtlFlexRow(isRTL) }` (line 707)

Minbar is the only tab that doesn't destructure `isRTL` from `useTranslation()` — line 161 only gets `t`:
```tsx
const { t } = useTranslation();
```

**Impact:** MEDIUM. Arabic users see a broken layout on the Minbar tab — the logo should be on the right with icons on the left, but it stays LTR.
**Fix:** Get `isRTL` from `useTranslation()` and apply `rtlFlexRow(isRTL)` to the header.

---

### Finding 53-022: Minbar notification badge position not RTL-aware
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 492-496
**Code:**
```tsx
notifBadge: {
  position: 'absolute',
  top: -6,
  right: -8,
},
```
**Problem:** The notification badge is hardcoded to `right: -8`. In RTL mode, it should be `left: -8`. Compare with Saf which uses `rtlAbsoluteEnd(isRTL, -8)` at line 470. Minbar doesn't even have access to `isRTL` (Finding 53-021).

**Impact:** LOW. Badge position is slightly off in Arabic RTL mode.

---

### Finding 53-023: Minbar `continueWatchingQuery.data` has unsafe access pattern
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 184-188
**Code:**
```tsx
const continueWatchingQuery = useQuery({
  queryKey: ['watch-history'],
  queryFn: () => usersApi.getWatchHistory(),
  select: (data) => data.data?.filter((v) => v.progress > 0 && !v.completed).slice(0, 10) ?? [],
});
```
Then at line 285:
```tsx
{item.progress * 100}%
```
**Problem:** The `select` transform accesses `data.data?.filter(...)` which depends on the API response shape. If the API returns `{ data: undefined }` or changes its shape, the `.filter()` call will crash. The `?? []` fallback only handles `undefined` from `data.data`, not from a thrown error inside `filter()`.

Also at line 285, `item.progress` is accessed without null check — if any item in the watch history has `progress: undefined`, this will render `NaN%`.

**Impact:** LOW. Defensive coding issue.

---

### Finding 53-024: Saf tab scroll-to-top on focus fires unconditionally
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 223-228
**Code:**
```tsx
useEffect(() => {
  const unsubscribe = navigation.addListener('focus' as never, () => {
    feedRef.current?.scrollToOffset({ offset: 0, animated: true });
  });
  return unsubscribe;
}, [navigation]);
```
**Problem:** Every time the Saf tab gains focus (including returning from a modal, notification screen, or any navigation), the feed scrolls to the top. This is annoying if the user was mid-scroll, navigated to a post detail, then came back — they lose their scroll position.

The same pattern exists in:
- `majlis.tsx` lines 99-104
- `risalah.tsx` lines 190-195
- `minbar.tsx` lines 177-182

**Impact:** LOW-MEDIUM. Poor UX — users lose their scroll position when switching tabs or returning from sub-screens.
**Fix:** Only scroll to top on "tab press" (which is already handled by `useScrollToTop`), not on every focus event.

---

### Finding 53-025: Saf `listHeader` useMemo has `feedTypeAnimStyle` dependency which changes every frame
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 382
**Code:**
```tsx
), [storyGroups, feedType, setFeedType, user?.id, router, feedTypeAnimStyle, bannerDismissed, dismissBanner]);
```
**Problem:** `feedTypeAnimStyle` is the result of `useAnimatedStyle()` (line 339). Reanimated animated styles are worklet-driven and their references may change. Including an animated style in a `useMemo` dependency array may cause the memo to invalidate more often than expected, or may not invalidate when the animation value changes (since the animated style reference is stable but the internal worklet values change on the UI thread).

**Impact:** NEGLIGIBLE. This is a code smell but unlikely to cause visible issues.

---

### Finding 53-026: Risalah FAB position uses `bottom: spacing['2xl']` which puts it above the tab bar
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 616-631
**Code:**
```tsx
fab: {
  position: 'absolute',
  bottom: spacing['2xl'],  // spacing['2xl'] = 32
  right: spacing.base,
  ...
},
```
**Problem:** The "Channels" FAB button is positioned `bottom: 32` which is measured from the bottom of the `SafeAreaView`. However, the tab bar is absolutely positioned over the screen content (via `position: 'absolute'` in `_layout.tsx` line 247). This means the FAB sits BEHIND the tab bar (tab bar height is 65px per `tabBar.height`). The FAB needs `bottom: tabBar.height + margin` to clear the tab bar.

Compare with Majlis FAB:
```tsx
bottom: tabBar.height + 16,  // Correctly accounts for tab bar
```

**Impact:** MEDIUM. The "Channels" FAB on Risalah is partially or fully hidden behind the tab bar.
**Fix:** Change to `bottom: tabBar.height + 16` or similar.

---

### Finding 53-027: `create.tsx` — `router.back()` in useEffect without dependency on router
**File:** `apps/mobile/app/(tabs)/create.tsx`, lines 9-10
**Code:**
```tsx
useEffect(() => { router.back(); }, []);
```
**Problem:** The `router` is used inside the effect but is not in the dependency array. While this is intentional (fire-once redirect), it triggers an ESLint exhaustive-deps warning and the pattern is fragile — if the user somehow lands on this route, `router.back()` may navigate to an unexpected screen depending on navigation history. If there's no history (deep link directly to create tab), `back()` will be a no-op.

**Impact:** NEGLIGIBLE. Edge case only.

---

### Finding 53-028: Saf — `formatHijriDate` called on every render without memoization
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 423
**Code:**
```tsx
<Text style={styles.hijriDate}>{formatHijriDate(new Date(), isRTL ? 'ar' : 'en')}</Text>
```
**Problem:** `formatHijriDate(new Date(), ...)` is called on every render. Hijri date calculations involve lunar calendar math which is more expensive than a simple `Date.now()`. This runs every time any state in the Saf screen changes (scroll, refresh, feed type change, etc.).

**Impact:** NEGLIGIBLE. The computation is likely fast enough, but it should be memoized with `useMemo` keyed on the current day.

---

### Finding 53-029: `_layout.tsx` — `scale` shared value in `TabIcon` is created but never used
**File:** `apps/mobile/app/(tabs)/_layout.tsx`, line 39
**Code:**
```tsx
const scale = useSharedValue(1);
```
**Problem:** `scale` is declared but never referenced anywhere. The `animatedStyle` at line 41 uses `focused` directly, not `scale`. This is dead code creating an unnecessary shared value for every tab icon.

**Impact:** NEGLIGIBLE. Minor memory waste.

---

### Finding 53-030: `_layout.tsx` — `tabBarBackground` returns `null` for web wide mode (type issue)
**File:** `apps/mobile/app/(tabs)/_layout.tsx`, lines 174-185
**Code:**
```tsx
tabBarBackground: () =>
  isWebWide ? null : (
    Platform.OS === 'ios' ? (
      <BlurView ... />
    ) : (
      <View ... />
    )
  ),
```
**Problem:** `tabBarBackground` expects a `React.ReactNode` return, but returns `null` when `isWebWide` is true. While `null` is technically valid JSX, the Expo/React Navigation `tabBarBackground` type may expect `undefined` to mean "no background." Returning `null` renders nothing, which is correct, but combined with `tabBarStyle: styles.tabBarHidden` for web wide mode, the tab bar is hidden anyway, so this is redundant.

**Impact:** NEGLIGIBLE.

---

### Finding 53-031: Bakra — `handleViewableItemsChanged` has stale closure over `currentIndex`
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 509-535
**Code:**
```tsx
const handleViewableItemsChanged = useCallback(({ viewableItems }: ...) => {
  if (viewableItems.length > 0) {
    const rawIndex = viewableItems[0].index;
    if (rawIndex != null && rawIndex !== currentIndex) {  // reads currentIndex
      const prevReel = reels[currentIndex];  // reads currentIndex again
      ...
    }
  }
}, [currentIndex, reels, onViewableChange, markPlaying]);  // currentIndex in deps
```
**Problem:** The callback depends on `currentIndex` and `reels`, which means it is recreated every time `currentIndex` changes. FlashList's `onViewableItemsChanged` is documented to cause issues if the callback reference changes frequently — it can lead to missed or duplicate viewability callbacks. The React documentation for `onViewableItemsChanged` in VirtualizedList (which FlashList wraps) states: "Changing the `onViewableItemsChanged` on the fly is not supported."

**Impact:** MEDIUM. May cause missed video play/pause events or duplicate view tracking.
**Fix:** Use a ref to hold `currentIndex` and `reels` so the callback reference stays stable.

---

### Finding 53-032: Bakra — video view tracking fires on every scroll, no dedup
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, line 524
**Code:**
```tsx
reelsApi.view(newReel.id).catch(() => {});
```
**Problem:** Every time the user scrolls to a new index and back, `reelsApi.view()` is called again for the same reel. There is no set/map tracking which reels have already been viewed. If the user scrolls up and down repeatedly, the same reel's view count is inflated.

**Impact:** MEDIUM. View count inflation — analytics become unreliable.
**Fix:** Track viewed reel IDs in a `Set` ref and skip the API call if already viewed.

---

### Finding 53-033: Saf — `suggestedUsers` dependency in `useMemo` uses filtered array that's unstable
**File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 288-303
**Code:**
```tsx
const suggestedUsers = (suggestedQuery.data ?? []).filter((u) => !dismissedUserIds.has(u.id));
...
const feedItems: FeedItem[] = useMemo(() => {
  ...
}, [rawPosts, suggestedUsers]);
```
**Problem:** `suggestedUsers` is a filtered array created on every render (not memoized). It creates a new array reference each time, which invalidates the `feedItems` useMemo on every render. The `feedItems` memo is expensive (iterates all posts), so this defeats the memoization.

**Impact:** LOW. The iteration is O(n) on the posts array which is likely small enough to not matter.
**Fix:** Memoize `suggestedUsers` with `useMemo`.

---

### Finding 53-034: Majlis — `AnimatedThreadCard` calls `useTranslation()` inside memo component per card
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 63
**Code:**
```tsx
const { isRTL: isRTLLocal } = useTranslation();
```
**Problem:** Every `AnimatedThreadCard` calls `useTranslation()` to get `isRTL`. This is technically correct (hooks can be called in functional components), but it means each card subscribes to language changes independently. In a list of 50 threads, that's 50 subscriptions to the i18n context.

**Impact:** NEGLIGIBLE. React's context propagation handles this efficiently.

---

### Finding 53-035: Majlis — `listEmpty` useMemo is missing `t` from dependency array (duplicate of 53-012 but important)
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 160
**Code:**
```tsx
), [feedQuery.isLoading, router]);
```
Uses `t()` at lines 154-157 but `t` is not in deps. Already covered in 53-012 but repeated here for the Majlis-specific instance.

---

### Finding 53-036: All tabs — `SafeAreaView edges={['top']}` does not protect bottom content from tab bar overlap
**Files:** All tab screens
**Code (example from saf.tsx line 418):**
```tsx
<SafeAreaView style={styles.container} edges={['top']}>
```
**Problem:** All 5 tab screens use `edges={['top']}` which only adds safe area inset at the top (for the notch/dynamic island). The bottom is NOT protected. Since the tab bar is absolutely positioned (`position: 'absolute'` in `_layout.tsx`), content at the bottom of each screen's scrollable list may be hidden behind the tab bar.

The `FlashList` components don't have `contentContainerStyle={{ paddingBottom: tabBar.height }}` to compensate.

**Impact:** MEDIUM. The last few items in every feed may be partially or fully hidden behind the tab bar. Users have to scroll past them to see the full content.
**Fix:** Add `contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}` to each FlashList/FlatList.

---

### Finding 53-037: Risalah — `handleRefresh` does not set refreshing state
**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 275
**Code:**
```tsx
const handleRefresh = useCallback(() => { refetch(); }, [refetch]);
```
Then at line 485:
```tsx
refreshing={isRefetching && !isLoading}
```
**Problem:** Unlike the other tabs which use a manual `refreshing` state (`setRefreshing(true); await refetch(); setRefreshing(false);`), Risalah uses `isRefetching && !isLoading` from React Query. This is actually a valid alternative approach. However, the `onRefresh` handler calls `refetch()` without `await`, meaning the RefreshControl spinner timing is entirely dependent on React Query's internal state.

**Impact:** NEGLIGIBLE. This works correctly but differs from the pattern in other tabs.

---

### Finding 53-038: Bakra — SafeAreaView with `edges={['top']}` overlaps with absolute header
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 705, 788-799
**Code:**
```tsx
<SafeAreaView style={styles.container} edges={['top']}>
  {/* Header */}
  <View style={[styles.header, ...]}>
```
Where `styles.header` is:
```tsx
header: {
  ...
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
},
```
**Problem:** The `SafeAreaView` applies top padding for the safe area, but the header is `position: 'absolute'` with `top: 0`, meaning it ignores the safe area inset and overlaps with the status bar/dynamic island. The header should use `top: safeAreaInsets.top` or be placed inside the safe area flow rather than absolute.

**Impact:** MEDIUM. On notched/dynamic island iPhones, the Bakra header text overlaps with the status bar.
**Fix:** Either remove `position: 'absolute'` from the header (let it flow normally inside SafeAreaView), or manually add `top: safeAreaInsets.top` using `useSafeAreaInsets()`.

---

### Finding 53-039: Bakra — `shortcutRow` position `top: 50` is hardcoded, ignores safe area
**File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 931-937
**Code:**
```tsx
shortcutRow: {
  position: 'absolute',
  top: 50,
  left: spacing.base,
  zIndex: 10,
  ...
},
```
**Problem:** The side panel shortcuts ("Live" and "Series" pills) are at a hardcoded `top: 50`. On devices with different notch sizes (iPhone 15 Pro Max vs iPhone SE), this may overlap with the status bar or be too far from the header.

**Impact:** LOW. Only affects device-specific layouts.

---

### Finding 53-040: Minbar — `selectedVideoId` captured in BottomSheet closure may be null
**File:** `apps/mobile/app/(tabs)/minbar.tsx`, lines 452-455
**Code:**
```tsx
onPress={() => {
  setSelectedVideoId(null);
  router.push(`/(screens)/report?type=video&id=${selectedVideoId}`);
}}
```
**Problem:** `setSelectedVideoId(null)` is called BEFORE `router.push(...)`. Since `setSelectedVideoId(null)` is a state update, it doesn't take effect synchronously in the same render cycle, so `selectedVideoId` in the `router.push` template literal still has the correct value. However, the logical order is confusing — clearing the selection before using it.

**Impact:** NEGLIGIBLE. Works correctly due to React's batched state updates, but the code ordering is misleading.

---

### Finding 53-041: `_layout.tsx` — tab order does not match standard social media patterns
**File:** `apps/mobile/app/(tabs)/_layout.tsx`, lines 188-239
**Tab order:** Saf | Bakra | Minbar | [Create] | Majlis | Risalah

**Problem:** The tab order is unusual:
1. Saf (Home/Feed) — standard first position, correct
2. Bakra (Reels) — second, this is where Instagram puts Reels, reasonable
3. Minbar (Long Video) — third, before the social/messaging tabs
4. Create — center, standard
5. Majlis (Threads/X) — fourth
6. Risalah (Messages) — last

Instagram's order: Home | Search | Reels | Shop | Profile
TikTok's order: Home | Friends | + | Inbox | Profile

Having long video (Minbar) at position 3 before the social thread (Majlis) is unusual. Most apps put the social/explore function before the passive video watching function.

**Impact:** NEGLIGIBLE. This is a UX design decision, not a bug. Documented for awareness.

---

### Finding 53-042: Saf — `useScrollToTop` ref type casting
**File:** `apps/mobile/app/(tabs)/saf.tsx`, line 221
**Code:**
```tsx
useScrollToTop(feedRef as React.RefObject<FlashListRef<Post | { _type: 'suggested' }>>);
```
**Problem:** The ref is cast to match `useScrollToTop`'s expected type. This is because FlashList's ref type doesn't perfectly match React Navigation's expected `scrollToTop` interface. The cast suppresses type checking — if FlashList's scroll API changes, this won't produce a compile error.

**Impact:** NEGLIGIBLE. Standard workaround for FlashList + React Navigation interop.

---

### Finding 53-043: Majlis — `highEngagementCard` style defined but never used directly
**File:** `apps/mobile/app/(tabs)/majlis.tsx`, lines 388-391
**Code:**
```tsx
highEngagementCard: {
  borderLeftWidth: 2,
  borderLeftColor: colors.gold,
},
```
**Problem:** This style is defined in the StyleSheet but never referenced in the JSX. The high engagement border is applied via `rtlBorderStart(isRTLLocal, 2, colors.gold)` at line 67, making this style definition dead code.

**Impact:** NEGLIGIBLE. Dead code.

---

## Summary

| Tier | Count | Key Items |
|------|-------|-----------|
| 0 — Ship Blockers | 3 | ScreenErrorBoundary crashes on error (t() undefined), no API error state on any tab, Majlis video tab type mismatch |
| 1 — Critical Functional | 5 | Risalah has no search, Bakra has no snap scrolling, shared gesture handler, heart trigger mass re-render, Bakra missing brand font |
| 2 — Data / Logic | 11 | Unused store variable, placeholder data stub, missing useMemo deps, socket not joining rooms, socket leak, unstable callbacks, view tracking inflation |
| 3 — UI / Polish | 12 | Inline styles, hardcoded colors, missing RTL on Minbar, FAB behind tab bar, content under tab bar, absolute header overlapping status bar |
| **Total** | **31** | |

### Most Critical Fix Priority:
1. **ScreenErrorBoundary** — fix `t()` call in class component (affects all screens, not just tabs)
2. **API error states** — add `isError` handling to all 5 tab feed queries
3. **Bakra snap scrolling** — add `pagingEnabled` or `snapToInterval` for TikTok UX
4. **Risalah search** — add conversation search to messaging tab
5. **Bottom tab bar content overlap** — add `paddingBottom: tabBar.height` to all lists
