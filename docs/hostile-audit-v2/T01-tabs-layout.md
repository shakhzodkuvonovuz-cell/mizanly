# T01 - Hostile Audit: Tabs, Layout, Onboarding

**Scope:** Root layout (`app/_layout.tsx`), tab layout (`app/(tabs)/_layout.tsx`), all 6 tab screens (`saf`, `bakra`, `create`, `risalah`, `majlis`, `minbar`), onboarding (`app/onboarding/*`), deep linking (`src/utils/deepLinking.ts`), error boundaries.

**Auditor:** Claude Opus 4.6  
**Date:** 2026-04-05  
**Files read:** 14 files, every line.

---

## Findings Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 8 |
| MEDIUM   | 12 |
| LOW      | 9 |
| INFO     | 5 |
| **TOTAL** | **37** |

---

## CRITICAL

### C1. Auth guard allows unauthenticated users to browse all tab screens
**File:** `app/_layout.tsx`, lines 377-389  
**Code:**
```ts
if (!isSignedIn) {
  // Allow anonymous browsing of feed tabs -- only redirect to auth if in onboarding
  if (inOnboarding) router.replace('/(auth)/sign-in');
  // If user is already in auth screens or tabs, let them stay
}
```
**Problem:** When `isSignedIn === false`, the guard only redirects users in the onboarding group. All tab screens (saf, bakra, majlis, minbar, risalah) are accessible without authentication. Every tab screen calls `useUser()` and reads `user?.id` -- this will be `undefined`, meaning:
- `saf.tsx` line 208: `user?.id` is undefined, all feed queries run unauthenticated, `viewerId` prop to PostCard is undefined
- `risalah.tsx` line 139: `user?.id` is undefined, all conversation member matching fails (`item.members.find(m => m.user.id !== myId)` returns wrong member when `myId` is undefined)
- `bakra.tsx` line 539: `user?.id` is undefined, like/bookmark mutations send unauthenticated requests that will 401

**Impact:** Unauthenticated users can browse feeds (possibly intentional as a growth feature), but the screens do NOT gracefully handle the missing user. No "sign in to interact" prompts exist on any engagement action (like, comment, bookmark, follow). API calls will fail silently with 401s, generating Sentry noise and confusing the user.

**Fix:** Either (a) redirect unauthenticated users to auth screens from tabs, or (b) add conditional rendering in each tab that shows a "Sign in to see personalized content" CTA and disables all mutation buttons.

### C2. Deep link path traversal / injection via unsanitized params
**File:** `src/utils/deepLinking.ts`, lines 79-88  
**Code:**
```ts
if (segments.length >= 2) {
  const id = segments[1];
  if (screen === 'profile') {
    params.username = id;
  } else if (screen === 'hashtag') {
    params.tag = id;
  } else {
    params.id = id;
  }
}
```
Then at lines 156-260, these raw `params.id` values are interpolated directly into navigation paths:
```ts
navigate(`/(screens)/post/${params.id}`);
navigate(`/(screens)/profile/${params.username}`);
navigate(`/(screens)/hashtag/${params.tag}`);
```
**Problem:** No sanitization on path segments. A crafted deep link like `mizanly://post/../../(auth)/sign-in` or `mizanly://profile/../../onboarding/username` could navigate to unintended routes. The `id` value could contain path separators, special characters, or very long strings. While expo-router may handle some of this, there is no explicit validation that `id` is a valid UUID, `username` matches a safe pattern, or `tag` is alphanumeric.

**Impact:** Route injection. An attacker could craft a deep link that navigates to any screen in the app, bypassing normal navigation flow. Combined with C1 (no auth on tabs), this could expose protected screens.

**Fix:** Validate params before navigation: `id` must match UUID regex, `username` must match `/^[a-z][a-z0-9._]{1,28}[a-z0-9]$/` (same as onboarding), `tag` must be alphanumeric.

### C3. unsafeMetadata race condition: onboarding can be marked complete without backend account
**File:** `app/onboarding/suggested.tsx`, lines 81-92  
**Code:**
```ts
const handleFinish = async () => {
  setFinishing(true);
  try {
    await user?.update({ unsafeMetadata: { onboardingComplete: true } });
    router.replace('/(tabs)/saf');
  } catch {
    router.replace('/(tabs)/saf'); // <-- navigates to home even on failure!
  } finally {
    setFinishing(false);
  }
};
```
**Problem:** The suggested.tsx screen marks onboarding as complete and navigates to home EVEN WHEN the update fails (catch block still calls `router.replace`). Furthermore, `suggested.tsx` does NOT spread existing unsafeMetadata -- it overwrites with `{ onboardingComplete: true }`, destroying any previously-stored metadata (interests, madhab). Compare with `interests.tsx` line 78 which correctly spreads: `{ ...user.unsafeMetadata, onboardingComplete: true }`.

**Impact:** (a) Users can end up on the home feed without a valid backend account if `user?.update` fails. (b) The `suggested.tsx` screen destroys metadata set by prior onboarding steps.

**Fix:** In the catch block, show an error toast and do NOT navigate. Spread existing metadata: `{ ...user.unsafeMetadata, onboardingComplete: true }`.

---

## HIGH

### H1. Mutation onMutate callback is dead code
**File:** `app/_layout.tsx`, lines 217-222  
**Code:**
```ts
onMutate: () => {
  // Block mutations when offline -- give clear feedback instead of cryptic network error
  const { NetInfo } = require('@react-native-community/netinfo') ?? {};
  // Simple check: if the store says offline, reject early
  // (The actual network check happens via useNetworkStatus hook)
},
```
**Problem:** This callback does absolutely nothing. It imports `NetInfo` into a destructured variable, then never uses it. The comment says "block mutations when offline" but no blocking logic exists. The `require()` call inside a callback is also wasteful -- it runs on every mutation.

**Impact:** Offline mutation blocking is not implemented despite the comment claiming it is. Mutations fire normally when offline, resulting in network errors caught by the `onError` handler. This is misleading -- someone reading the code would think offline protection exists.

### H2. EidCelebrationOverlay: setTimeout leaks, blocks interaction, uses SecureStore incorrectly
**File:** `app/_layout.tsx`, lines 155-196  
**Code:**
```ts
useEffect(() => {
  if (!isEid) return;
  const checkAndShow = async () => {
    // ...
    setTimeout(() => setShowCelebration(false), 3000);
  };
  checkAndShow();
}, [isEid]);
```
**Problems:**
1. The `setTimeout` is not cleaned up in the effect's return function. If the component unmounts before 3 seconds, the timer fires on an unmounted component.
2. Lines 179-195: The overlay uses `...StyleSheet.absoluteFillObject` with `zIndex: 10000` and `opacity: 0.95`. This covers the ENTIRE screen including navigation. No `pointerEvents="none"` is set, meaning the user CANNOT interact with the app for 3 full seconds.
3. `SecureStore` is used for a non-sensitive date string (`lastEidCelebrationDate`). SecureStore has a 2KB value limit and is backed by Keychain/Keystore -- inappropriate for UI state. `AsyncStorage` is the correct choice.

### H3. BiometricLockOverlay races with navigation
**File:** `app/_layout.tsx`, lines 420-460  
**Problem:** The `BiometricLockOverlay` triggers authentication on every `AppState.addEventListener('change')` when `biometricLockEnabled` is true. Line 437-444: when app comes to foreground, it immediately sets `isLocked(true)` and shows the overlay. But the `authenticateAsync` call is async -- there's a visible flash where the lock overlay appears, then disappears. More critically, there's no debounce: rapid app state changes (e.g., quick background/foreground toggling) will queue multiple authentication prompts, which on iOS causes a system-level prompt conflict.

### H4. Tab screens have no auth gate for mutations
**File:** All tab screens  
**Locations:**
- `saf.tsx` line 358: `followMutation.mutate(userId)` -- no user check
- `bakra.tsx` line 671: `handleLike` -- no user check
- `risalah.tsx` line 252: `archiveMutation` -- no user check
- `minbar.tsx` line 306: `handleSaveToWatchLater` -- no user check
- `majlis.tsx` line 469: FAB press navigates to create-thread -- no user check

**Problem:** Per C1, unauthenticated users can reach these screens. All mutation handlers fire API calls without checking if `user?.id` exists. These will all 401 at the API layer, but the user gets a generic "something went wrong" toast instead of a "please sign in" prompt.

### H5. renderItem dependency arrays include `tc.bg` in risalah but callback doesn't use it
**File:** `app/(tabs)/risalah.tsx`, line 405  
**Code:**
```ts
}, [user?.id, router, onlineUsers, typingUsers, archiveMutation, t, haptic, queryClient, tc.text.primary, tc.bg]);
```
**Problem:** `tc.bg` is listed in the dependency array but is not used inside the `renderItem` callback. This causes unnecessary re-creation of the `renderItem` callback (and therefore full list re-renders) every time the theme changes. Conversely, `tc.text.secondary` IS used (line 373, for the pin action button) but is NOT in the dependency array, meaning the pin/archive actions render with stale theme colors after a theme switch.

### H6. Double deep link handler: both DeepLinkHandler and ShareIntentHandler process initial URL
**File:** `app/_layout.tsx`, lines 482-514  
**Problem:** `DeepLinkHandler` (line 484) calls `setupDeepLinkListeners()` which calls `Linking.getInitialURL()` at line 274 of deepLinking.ts. `ShareIntentHandler` (line 506) also calls `Linking.getInitialURL()`. Both fire on mount. If the app is cold-launched via a deep link, both handlers will try to process the same URL. If it's a share intent URL, `ShareIntentHandler` navigates to share-receive, but `DeepLinkHandler` also tries to parse it (and may fail or navigate elsewhere). If it's a regular deep link, `DeepLinkHandler` handles it correctly, but `ShareIntentHandler` also processes it and may match on query params.

**Impact:** Duplicate navigation or conflicting navigation on cold-start deep links.

### H7. `Dimensions.get('window')` at module scope in minbar.tsx
**File:** `app/(tabs)/minbar.tsx`, lines 40-41  
**Code:**
```ts
const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMBNAIL_HEIGHT = Math.round(SCREEN_WIDTH * 9 / 16);
```
**Problem:** `Dimensions.get('window')` at module scope captures the dimensions once when the module is first imported. On iPads with split view, foldable Android devices, or when rotating between portrait/landscape, these values are stale. The thumbnail height will be wrong after any dimension change.

**Fix:** Use `useWindowDimensions()` hook inside the component (like bakra.tsx correctly does at line 545).

### H8. Onboarding username screen skips profile step
**File:** `app/onboarding/username.tsx`, line 122  
**Code:**
```ts
await authApi.register({ username, displayName: username });
router.push('/onboarding/interests');
```
**Problem:** After username registration, the flow goes directly to `interests`, skipping `profile`. The profile screen exists (`app/onboarding/profile.tsx`) and is declared in the layout (`_layout.tsx` line 7), but the username screen navigates past it. Meanwhile, `interests.tsx` goes directly to `router.replace('/(tabs)/saf')` at line 96, also skipping `suggested.tsx`. The declared onboarding flow in the layout is `username -> profile -> interests -> suggested`, but the actual flow is `username -> interests -> home`.

**Impact:** Two onboarding screens (`profile.tsx`, `suggested.tsx`) are dead code in the normal flow. Users never get to set a display name or bio during onboarding. Users never see suggested accounts to follow. This hurts first-run experience and cold-start engagement.

---

## MEDIUM

### M1. `any` type usage in non-test code
**File:** `app/_layout.tsx`, lines 302-304  
**Code:**
```ts
.filter((c: any) => !c.isGroup)
.slice(0, 10)
.map((c: any) => c.members?.find((m: any) => m.userId !== user.id)?.userId)
```
**Problem:** Three `any` casts in the Signal Protocol initialization. The `messagesApi.getConversations()` return type should be properly typed. Per project rules: "No `any` in non-test code."

### M2. Feed cache reads fire on every feedType change without cancellation
**File:** `app/(tabs)/saf.tsx`, lines 367-373; `majlis.tsx`, lines 190-196; `minbar.tsx`, lines 246-252  
**Pattern:**
```ts
useEffect(() => {
  feedCache.get(CACHE_KEYS.SAF_FEED + ':' + feedType).then((cached) => {
    if (cached) setCachedFeedData(cached as Record<string, unknown>);
    else setCachedFeedData(null);
  });
}, [feedType]);
```
**Problem:** If the user rapidly switches feed types, multiple async `feedCache.get` calls race. The last one to resolve wins, but it may not be the one corresponding to the current `feedType`. No cancellation pattern (like an `isCancelled` flag) is used. This could show cached data for the wrong feed type.

### M3. `lastReadAt` missing from majlis.tsx renderItem deps
**File:** `app/(tabs)/majlis.tsx`, line 341  
**Code:**
```ts
const renderItem = useCallback(({ item, index }: { item: Thread; index: number }) => (
  <AnimatedThreadCard
    thread={item}
    viewerId={user?.id}
    isOwn={user?.username === item.user.username}
    index={index}
    isRTL={isRTL}
    isRead={!lastReadAt || new Date(item.createdAt) <= new Date(lastReadAt)}
  />
), [user?.id, user?.username, isRTL]);
```
**Problem:** `lastReadAt` is used inside the callback but NOT in the dependency array. When `lastReadAt` updates (on focus, line 107-108), the renderItem callback is stale. Threads that were unread when the tab was last rendered will still show as unread even after the user has viewed them.

### M4. Socket event handlers create new Set/Map on every event
**File:** `app/(tabs)/risalah.tsx`, lines 171-199  
**Code:**
```ts
const handleUserOnline = ({ userId }: { userId: string }) => {
  setOnlineUsers(prev => new Set(prev).add(userId));
};
```
**Problem:** Every `user_online`, `user_offline`, and `user_typing` event creates a new `Set` or `Map`. With many users going online/offline (common in chat apps), this generates high GC pressure. Functional state updates with Set/Map are inherently O(n) copy operations.

### M5. Missing RTL support in several components
**Files:**
- `app/(tabs)/minbar.tsx` line 337-403: `listHeader` useMemo -- the "Continue Watching" section uses `flexDirection: 'row'` hardcoded in styles (line 709), not `rtlFlexRow(isRTL)`
- `app/(tabs)/risalah.tsx` line 570-683: Multiple StyleSheet styles use hardcoded `flexDirection: 'row'` (lines 594, 602, 615, 647, 670) instead of RTL-aware variants. Only the component JSX uses RTL overrides -- the fallback static styles are LTR-only.
- `app/onboarding/suggested.tsx`: No RTL support at all -- `flexDirection: 'row'` on lines 161, 170 without any `rtlFlexRow` usage.
- `app/onboarding/profile.tsx`: No RTL support for input rows or labels.

### M6. Feed queries run without checking if user exists
**File:** `app/(tabs)/saf.tsx`, lines 375-391  
**Code:**
```ts
const feedQuery = useInfiniteQuery({
  queryKey: ['saf-feed', feedType],
  queryFn: async ({ pageParam }) => {
    const res = await postsApi.getFeed(feedType, pageParam as string | undefined);
    // ...
  },
  // no `enabled` check for user existence
});
```
**Problem:** The feed query always runs, even for unauthenticated users (per C1). The "following" feed type requires authentication to know who to follow. This will either 401 or return an empty feed. Same pattern in all other tab screens' queries.

### M7. Scroll restoration uses fragile setTimeout(100ms)
**Files:** `saf.tsx` line 277, `bakra.tsx` line 581, `minbar.tsx` line 228  
**Code:**
```ts
const timer = setTimeout(() => {
  feedRef.current?.scrollToOffset({ offset, animated: false });
}, 100);
```
**Problem:** The 100ms delay is a magic number. On slow devices or with large lists, the FlashList may not have finished layout in 100ms, causing the scroll to target a position that doesn't exist yet. On fast devices, it's a wasted 100ms of visible jump. Majlis.tsx correctly uses a data-dependent approach (line 243-247: waits for `threads.length > 0`) but the others don't.

### M8. Missing keyboard dismissal on tab switch
**File:** `app/(tabs)/_layout.tsx`  
**Problem:** No `Keyboard.dismiss()` call on tab switch. If a user has the keyboard open (e.g., in risalah search, or majlis compose), switching tabs leaves the keyboard up on iOS. The `listeners={{ tabPress: () => haptic.tick() }}` pattern could include `Keyboard.dismiss()`.

### M9. QueryClient instantiated at module scope
**File:** `app/_layout.tsx`, line 207  
**Code:**
```ts
const queryClient = new QueryClient({ ... });
```
**Problem:** The QueryClient is a module-level singleton. While this works, it means cache survives across sign-out/sign-in cycles. If User A signs out and User B signs in, User B will see User A's cached conversations, feed, and notifications until the cache expires (5-10 minutes). There is no `queryClient.clear()` call in the `signOut` flow.

### M10. Share intent handler does not validate URL params
**File:** `app/_layout.tsx`, lines 491-514  
**Code:**
```ts
const handleUrl = (event: { url: string }) => {
  const parsed = Linking.parse(event.url);
  const params = parsed.queryParams ?? {};
  if (params.sharedText || params.sharedImage || params.sharedVideo || params.sharedUrl) {
    navigate('/(screens)/share-receive', params as Record<string, string>);
  }
};
```
**Problem:** The query params are passed directly as navigation params with a bare `as Record<string, string>` cast. No validation on the content of `sharedImage` or `sharedVideo` (could be non-file URIs, extremely long strings, or contain special characters). The `sharedUrl` is forwarded without URL validation.

### M11. Notification count stored in both Zustand and React Query
**File:** `app/(tabs)/saf.tsx`, lines 335-344  
**Code:**
```ts
useQuery({
  queryKey: ['notifications-count'],
  queryFn: async () => {
    const data = await notificationsApi.getUnreadCount();
    setUnreadNotifications(data.unread ?? 0);
    return data;
  },
  refetchInterval: 60_000,
  enabled: !!user,
});
```
Then in `minbar.tsx` line 498: `setUnreadNotifications(0)` on bell press.

**Problem:** The unread count is stored in both Zustand (`setUnreadNotifications`) and React Query cache (`['notifications-count']`). The Zustand store is zeroed when the user taps notifications (minbar.tsx line 498), but the React Query cache still holds the old count. On the next 60s poll, the count resets to the server value. If the server hasn't processed the "mark as read" yet, the badge flickers back.

### M12. interests.tsx `handleSkip` marks onboarding complete without any backend call
**File:** `app/onboarding/interests.tsx`, lines 104-108  
**Code:**
```ts
const handleSkip = async () => {
  haptic.navigate();
  await markOnboardingComplete();
  router.replace('/(tabs)/saf');
};
```
**Problem:** Skipping interests marks `onboardingComplete: true` in Clerk metadata without calling `authApi.setInterests`. If the backend requires interests to be set before serving personalized content, the user will get a degraded experience with no way to know why.

---

## LOW

### L1. TabIcon creates animated styles unconditionally
**File:** `app/(tabs)/_layout.tsx`, lines 38-45  
**Problem:** Every `TabIcon` call creates `useAnimatedStyle` hooks even when `focused` hasn't changed. The `activePillStyle` opacity animation runs on every render cycle for all 5 tabs. This is 10 animated style computations per tab bar render.

### L2. Eid celebration overlay is not dismissible by user
**File:** `app/_layout.tsx`, lines 155-196  
**Problem:** The 3-second overlay has no close button and `pointerEvents` is not set. The user must wait the full 3 seconds. This is a minor UX issue but could frustrate users who are trying to quickly check something.

### L3. CoachMark in saf.tsx uses inline styles
**File:** `app/(tabs)/saf.tsx`, lines 637-650  
**Problem:** The coach mark banner uses inline styles instead of StyleSheet. This creates new objects on every render and doesn't benefit from the StyleSheet optimization.

### L4. `_getItemLayout` in bakra.tsx is defined but unused
**File:** `app/(tabs)/bakra.tsx`, lines 851-855  
**Code:**
```ts
const _getItemLayout = useCallback((_: ArrayLike<Reel> | null | undefined, index: number) => ({
  length: SCREEN_H,
  offset: SCREEN_H * index,
  index,
}), [SCREEN_H]);
```
**Problem:** The function is prefixed with `_` and never passed to FlashList. FlashList uses `estimatedItemSize` instead. This is dead code.

### L5. Static progress dots in suggested.tsx onboarding
**File:** `app/onboarding/suggested.tsx`, lines 96-99  
**Code:**
```ts
<View style={styles.progress}>
  {[1, 2].map((i) => (
    <View key={i} style={[styles.dot, { backgroundColor: tc.border }, styles.dotActive]} />
  ))}
</View>
```
**Problem:** Shows 2 dots, both active. The other onboarding screens show a progress bar (25%, 50%, 75%). This screen is inconsistent -- it should show 100% or use the same progress bar pattern.

### L6. ErrorBoundary uses hardcoded dark theme
**File:** `src/components/ErrorBoundary.tsx`, line 53  
**Code:**
```ts
container: {
  flex: 1, backgroundColor: colors.dark.bg,
```
**Problem:** The root ErrorBoundary always renders with dark theme regardless of the user's preference. There's even a TODO comment acknowledging this (line 50). The `ScreenErrorBoundary` handles this correctly using `Appearance.getColorScheme()`.

### L7. Audio marquee in bakra ReelItem never stops animating
**File:** `app/(tabs)/bakra.tsx`, lines 181-202  
**Problem:** When `isActive` is true, `marqueeAnim` runs `withRepeat(-1)`. When `isActive` becomes false (line 196), it sets `marqueeAnim.value = 0`, but does NOT call `cancelAnimation(marqueeAnim)`. The infinite repeat animation continues running on the worklet thread even after the reel is off-screen. This wastes CPU for every reel that was ever visible during the session.

### L8. Missing accessibility hints on several onboarding elements
**Files:**
- `app/onboarding/interests.tsx`: Interest chips have `accessibilityRole="button"` but no `accessibilityHint` explaining what selecting an interest does
- `app/onboarding/suggested.tsx`: Follow buttons have `accessibilityLabel` but no hint about the follow action's effect
- `app/onboarding/username.tsx`: The TextInput has no `accessibilityHint` explaining the username format requirements

### L9. `contentContainerStyle` inline objects in FlashLists
**Files:** `saf.tsx` line 757, `majlis.tsx` line 461, `minbar.tsx` line 536, `risalah.tsx` line 551  
**Code:**
```ts
contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}
```
**Problem:** Inline objects create new references on every render, which can trigger FlashList's internal diff. These should be memoized with `useMemo` like the other style references in the same files.

---

## INFO

### I1. Feature gap: no "pull to create" gesture on empty feed
**Files:** All tab screens  
**Observation:** When the feed is empty, the EmptyState shows a button to create content. But there's no pull-down gesture to trigger content creation, which is a common pattern in social apps (Instagram, TikTok).

### I2. Onboarding flow mismatch with layout declaration
**File:** `app/onboarding/_layout.tsx` declares 4 screens: `username -> profile -> interests -> suggested`. But the actual navigation flow only visits 2: `username -> interests`. Consider removing the dead screens from the layout to avoid confusion.

### I3. Module-level side effects
**File:** `app/_layout.tsx`, lines 1-2, 49-69, 71-79, 82-89, 92-95  
**Observation:** Multiple module-level side effects: `registerGlobals()`, `initCallKit()`, `setCallKitHandlers()`, `I18nManager` mutations, `Text.defaultProps` mutations, `initSentry()`, `SplashScreen.preventAutoHideAsync()`. These execute on import, before any React component mounts. While mostly necessary for React Native, they make the module hard to test and the execution order fragile.

### I4. `handleSaveToWatchLater` in minbar.tsx is not wrapped in useCallback
**File:** `app/(tabs)/minbar.tsx`, lines 306-315  
**Observation:** It's defined as a plain `async` function instead of using `useCallback`. It captures `haptic` and `t` in closure. Since it's only called from the BottomSheet (which is conditionally rendered), the impact is minimal, but it's inconsistent with the other handlers in the same file.

### I5. videoRefs in bakra.tsx grows unboundedly
**File:** `app/(tabs)/bakra.tsx`, line 554  
**Code:**
```ts
const videoRefs = useRef<{ [key: string]: Video }>({});
```
**Observation:** `setVideoRef` adds entries but nothing ever removes them. As the user scrolls through hundreds of reels, this object grows. The Video refs themselves may prevent garbage collection of unmounted video components, though FlashList's recycling may mitigate this.

---

## Cross-Cutting Observations

### Auth model is unclear
The codebase appears to be in transition between "anonymous browsing allowed" and "auth required for everything." The auth guard explicitly says "allow anonymous browsing of feed tabs" (line 378), but no tab screen actually handles the anonymous case. This needs a deliberate decision: either enforce auth on all tabs, or properly support anonymous mode with sign-in CTAs on interaction.

### Deep linking and share intents need unification
Two separate handlers (`DeepLinkHandler`, `ShareIntentHandler`) both listen for URLs at the root level. They both call `Linking.getInitialURL()`. The deep link handler in `deepLinking.ts` also processes the initial URL. There are potentially 3 handlers processing the same cold-start URL.

### Cleanup patterns are inconsistent
- `saf.tsx`, `bakra.tsx`, `minbar.tsx` use `setTimeout` in `useFocusEffect` with proper cleanup returns
- `_layout.tsx` `EidCelebrationOverlay` uses `setTimeout` WITHOUT cleanup
- `_layout.tsx` `BiometricLockOverlay` has proper cleanup on the AppState listener
- `majlis.tsx` `AnimatedThreadCard` has proper cleanup on the animation timer
- `_layout.tsx` line 349 `setTimeout` for profile nudge has NO cleanup

### Onboarding quality is below the tab screens
The onboarding screens have significantly less polish than the main tab screens: no RTL support, inconsistent progress indicators, skipped screens, simpler error handling. Given that onboarding is the first impression for every user, this gap is notable.
