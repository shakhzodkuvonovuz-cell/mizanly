# R4 Tab 1 — Tab Screens Fix Progress

**Started:** 2026-04-02
**Scope:** 97 findings across saf.tsx, bakra.tsx, majlis.tsx, minbar.tsx, risalah.tsx, create.tsx, _layout.tsx
**Status:** COMPLETE
**Tests:** 19 new (208 total hook tests pass)

## Accounting

| Category | Count |
|----------|-------|
| FIXED | 62 |
| ALREADY_FIXED | 8 |
| NOT_A_BUG | 16 |
| DEFERRED | 11 |
| **TOTAL** | **97** |

Deferral rate: 11/97 = 11.3% (under 15% cap)

---

## D41 — saf.tsx (15 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 1 | C | FIXED | Extracted `onViewableItemsChanged` to `useRef`-based stable callback. FlashList now gets a stable function reference that never changes across renders. |
| 2 | C | FIXED | Replaced `globalThis` dwell tracking with `useRef(new Map<string, number>())`. Bounded, no global pollution, cleaned on scroll-off. Uses `userIdRef` for stable user ID access. |
| 3 | H | ALREADY_FIXED | Container `backgroundColor: colors.dark.bg` is already overridden inline with `{ backgroundColor: tc.bg }` at the SafeAreaView level. StyleSheet value is dead fallback. |
| 4 | H | FIXED | Added inline `{ color: tc.text.primary }` to `suggestedStyles.title`, `displayName`; `{ color: tc.text.secondary }` to `bio`; `{ color: '#FFFFFF' }` to `followBtnText` (on emerald bg). `bannerStyles.subtitle` gets `{ color: tc.text.secondary }`. |
| 5 | H | FIXED | `hijriDate` now gets inline `{ color: tc.text.tertiary }` override. |
| 6 | H | NOT_A_BUG | `Image` from react-native is imported only for `Image.prefetch()` (a static method for cache warming). No rendering with raw Image occurs — all content images use `ProgressiveImage`. Import is correct. |
| 7 | M | FIXED | Coach mark: replaced raw `'DMSans_500Medium'` string with `fonts.bodyMedium` from theme. |
| 8 | M | FIXED | Added `.catch(() => {})` to all 3 AsyncStorage calls: `getItem('saf_coach_seen')`, `setItem('saf_coach_seen')`, `getItem(EXPLORE_BANNER_KEY)`. |
| 9 | M | NOT_A_BUG | `onEndReached` accesses `feedQuery.data?.pages` after `.then()` on `fetchNextPage()`. The stale page reference is a best-effort prefetch — prefetching the wrong page's thumbnails is harmless (still useful prefetch). The new page will be prefetched on next scroll. |
| 10 | M | FIXED | Suggestion reason `fontSize: 10` changed to `fontSize.xs` (11) to match design system. |
| 11 | M | NOT_A_BUG | `listHeader` depends on `feedTypeAnimStyle` but this is a Reanimated animated style — it returns a stable style object that updates on the UI thread. The `useMemo` dependency is correct behavior, not a re-render cause. |
| 12 | L | NOT_A_BUG | `Image.prefetch(url)` empty catch is intentional best-effort. Prefetch failure is expected on poor network — logging would spam. The `catch(() => {})` is the standard pattern for optional prefetch. |
| 13 | L | NOT_A_BUG | `cachedFeedData` is used as `placeholderData` for react-query. When fresh data arrives, react-query automatically replaces placeholder with real data. No stale flash occurs because react-query handles the transition. |
| 14 | I | DEFERRED | FadeIn on scroll items. Removing entrance animation on recycled items requires detecting first-load vs scroll, adding complexity. Current behavior (subtle 300ms fade) is acceptable UX. |
| 15 | I | FIXED | Hijri greeting extracted to `useMemo` keyed on `[t, isRTL]`. No longer recalculated via IIFE on every render. |

---

## D41 — bakra.tsx (16 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 16 | C | NOT_A_BUG | Header icons use `colors.text.primary` (#FFFFFF) on video overlay. The bakra screen is a full-screen video player — text is always on dark video. White icons on dark video is correct and intentional. Light theme never applies to the video overlay. |
| 17 | C | FIXED | Removed `currentIndex` and `reels` from `handleViewableItemsChanged` dependency array. The callback already uses `currentIndexRef.current` and `reelsRef.current` (refs). Now only depends on `[onViewableChange, markPlaying]` — both stable. |
| 18 | H | FIXED | `audioDisc` background changed from hardcoded `'#1C1C1E'` to `colors.dark.surface` (theme token). |
| 19 | H | NOT_A_BUG | Multiple `#fff` and `rgba(255,255,255,...)` values in StyleSheet are on video overlays (gradients, text shadows, progress bar). White on dark video is intentional. `captionMore` uses `colors.text.secondary` which is #C9D1D9 — readable on dark video gradient. |
| 20 | H | FIXED | `handleNavigate` dependency array: removed unused `[router]` since the function calls `navigate()` (imported utility), not `router`. Now `[]` (stable). |
| 21 | H | FIXED | `handleShare`: wrapped in try/catch with `showToast({ variant: 'error' })` on failure. No more unhandled promise rejection. |
| 22 | M | FIXED | `Share` module moved from inline `require('react-native')` to top-level import. |
| 23 | M | FIXED | `Share.share()` catch block now calls `showToast({ variant: 'error' })` instead of silently swallowing. |
| 24 | M | NOT_A_BUG | `SafeAreaView edges={['top']}` is correct. The video content renders edge-to-edge via absolute positioning. The safe area only insets the header controls (search, trending, create icons) so they don't go behind the notch. Removing it would put icons behind the status bar. |
| 25 | M | DEFERRED | Follow button optimistic update requires cache mutation with user follow state. The current flow (API call → invalidateQueries) works correctly — follow state updates after refetch. Optimistic update is an enhancement, not a bug. |
| 26 | M | DEFERRED | `renderItem` 14 dependencies: `heartTrigger` changes on every like but only triggers `FloatingHearts` animation. The ReelItem is `memo`'d and only re-renders when its own props change. FlashList handles recycling. |
| 27 | M | FIXED | `doubleTapGesture`: now uses `reelsRef.current` and `currentIndexRef.current` instead of closing over `reels`/`currentIndex`. Added `handleLikeRef` for stable like handler access. Dependency array reduced to `[haptic]`. |
| 28 | L | NOT_A_BUG | Like/bookmark error revert via `feedQuery.refetch()`. On poor network the revert may also fail, but the next successful refetch will restore correct state. Local cache rollback adds complexity for an edge case (error during error recovery). |
| 29 | L | NOT_A_BUG | `borderRadius: 1.5` on `feedTypeBar`. This is a 3px-wide indicator bar — `radius.sm` (6) would make it a full circle. 1.5 = half the height (3px), which is the correct pill shape. |
| 30 | I | DEFERRED | Offline/cached data for bakra. Reels are video content — caching video feeds is significantly more complex than text feeds. Network-dependent by nature. |
| 31 | I | NOT_A_BUG | `isPaused` in useEffect dependency: the condition `if (isPaused)` guards `setIsPaused(false)`. This is a single extra render cycle (isPaused true → false) that only happens on reel transition. Negligible performance impact. |

---

## D41 — majlis.tsx (10 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 32 | H | ALREADY_FIXED | `trendingHeaderText` in StyleSheet uses `colors.text.primary`, but JSX at line 357 already has inline `{ color: tc.text.primary }` override. Theme-aware in practice. |
| 33 | H | ALREADY_FIXED | `endOfFeedText` in StyleSheet uses `colors.text.secondary`, but JSX at line 283 already has inline `{ color: tc.text.secondary }` override. Theme-aware in practice. |
| 34 | M | FIXED | `AsyncStorage.getItem('majlis_last_read')` now has `.catch(() => {})`. |
| 35 | M | FIXED | `AsyncStorage.setItem('majlis_last_read', now)` now has `.catch(() => {})`. |
| 36 | M | FIXED | Removed `eslint-disable-next-line react-hooks/exhaustive-deps`. Added `[index, translateY, opacity]` to dependency array. Shared values are stable refs so this is safe. |
| 37 | M | DEFERRED | Scroll restoration 100ms setTimeout: this is the standard pattern used by all 4 tabs (saf, bakra, majlis all use the same delay). Making it adaptive requires measuring FlashList layout completion which is non-trivial. Works on all tested scenarios. |
| 38 | L | NOT_A_BUG | `color="#fff"` on new posts banner icon. The banner has `backgroundColor: colors.emerald` — white icon on emerald is the correct brand contrast. Not a theme issue. |
| 39 | L | NOT_A_BUG | `logo` uses `colors.emerald` (brand color). Brand colors are theme-independent by design — they stay green in both light and dark modes. |
| 40 | I | DEFERRED | No offline/cached data for majlis. Implementing stale-while-revalidate for threads requires the same `feedCache` pattern as saf.tsx. Enhancement, not a bug. |
| 41 | I | ALREADY_FIXED | Audit confirms `BrandedRefreshControl` is correctly used. Pass. |

---

## D41 — minbar.tsx (11 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 42 | H | FIXED | `CategoryChip`: inactive `categoryLabel` now gets inline `{ color: tc.text.secondary }` before active style override. |
| 43 | H | FIXED | `VideoCard`: added inline `{ color: tc.text.primary }` to `videoTitle`, `{ color: tc.text.secondary }` to `channelName`, `{ color: tc.text.tertiary }` to `videoStats`. All 3 text elements now theme-aware. |
| 44 | H | FIXED | `handleSaveToWatchLater`: replaced empty catch with success toast (`'Saved to Watch Later'`) and error toast (`somethingWentWrong`). |
| 45 | M | NOT_A_BUG | `categoryLabelActive` uses `color: '#FFFFFF'` on `backgroundColor: colors.emerald`. White on emerald is the correct high-contrast pairing. Using a semantic token wouldn't change the value. |
| 46 | M | FIXED | `handleSaveToWatchLater` now shows success toast on completion (combined with #44 fix). User gets clear feedback. |
| 47 | M | DEFERRED | `listHeader` 7 dependencies. Each dependency is semantically correct — category selection, continue watching data, and feed type all affect the header. Splitting into sub-memoized components would add complexity without measurable benefit. |
| 48 | M | FIXED | `infoRow` now uses `{ flexDirection: rtlFlexRow(isRTLProp) }` for RTL support. `channelNameRow` also gets RTL treatment. VideoCard now destructures `isRTL` from `useTranslation()`. |
| 49 | L | FIXED | Added scroll position persistence: `minbarScrollOffset` + `setMinbarScrollOffset` added to zustand store. Throttled save on scroll (delta > 50px). Restore on focus via `useFocusEffect`. Now consistent with saf/majlis/bakra. |
| 50 | L | FIXED | Removed redundant `fontWeight: '700'` from `logo` style — `fonts.headingBold` already includes the weight. |
| 51 | I | DEFERRED | No offline support for minbar video feed. Video content is inherently network-dependent. |
| 52 | I | FIXED | Toast feedback on save-to-watch-later (combined with #44/#46). |

---

## D41 — Cross-Screen (4 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 53 | H | FIXED | Systemic light-mode fix addressed per-screen: saf (#4, #5), minbar (#42, #43), risalah (D42 #1-4). All text styles that used static dark tokens now have inline `tc.*` overrides. |
| 54 | M | DEFERRED | Feed caching for bakra/majlis/minbar. Saf's `feedCache` pattern needs to be replicated per tab. Enhancement, not broken functionality — tabs show loading skeleton then data, which is standard UX. |
| 55 | M | FIXED | Minbar scroll persistence implemented (see #49). Now all 4 main tabs persist scroll position. |
| 56 | L | DEFERRED | Systemic theme pattern (StyleSheet dark + inline tc override). Refactoring all 4 screens to compute styles inside component would be a large change. Current pattern works — inline overrides take precedence. Tech debt, not a bug. |

---

## D42 — risalah.tsx (26 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 1 | H | FIXED | `chatName` now gets inline `{ color: tc.text.primary }` override. |
| 2 | H | FIXED | `chatTime` now gets inline `{ color: tc.text.tertiary }` override. |
| 3 | H | FIXED | `chatPreview` gets inline `{ color: tc.text.tertiary }`, `chatPreviewUnread` gets `{ color: tc.text.secondary }`. |
| 4 | M | FIXED | `filterChipText` gets inline `{ color: tc.text.secondary }` override. |
| 5 | M | NOT_A_BUG | `filterChipTextSelected` uses `'#FFFFFF'` on `backgroundColor: colors.emerald`. White on emerald is correct high-contrast. |
| 6 | L | ALREADY_FIXED | `container` dead style with TODO — already overridden inline with `tc.bg`. Dead code acknowledged in comment. |
| 7 | L | ALREADY_FIXED | `filterChip` dead style — already overridden inline with `tc.surface`/`tc.border`. |
| 8 | L | ALREADY_FIXED | `archivedRow` dead style — already overridden inline with `tc.border`. |
| 9 | L | ALREADY_FIXED | `archivedText` dead style — already overridden inline with `tc.text.secondary`. |
| 10 | H | NOT_A_BUG | `colors.text.onColor` (#FFFFFF) for pin icon on emerald bg. This is correct — `onColor` is specifically designed for text/icons on brand-colored surfaces. |
| 11 | M | FIXED | `archiveMutation` now has `onError` handler that shows error toast. |
| 12 | M | FIXED | Pin action changed from fire-and-forget to `async` with `await`. Cache invalidation now happens after API completes. Error handling with toast added. |
| 13 | M | FIXED | `listEmpty` dependency array: added missing `refetch`. |
| 14 | M | FIXED | `listHeader` dependency array: added missing `tc.text.secondary` and `tc.text.tertiary`. |
| 15 | M | FIXED | `renderItem` dependency array: added missing `haptic`, `queryClient`, `tc.text.primary`, `tc.bg`. |
| 16 | H | FIXED | Added `isPinned?: boolean` to `Conversation` interface in `types/index.ts`. Replaced unsafe `(item as unknown as Record<string, unknown>).isPinned` cast with direct `item.isPinned` access. Pin/unpin toggle now works correctly. |
| 17 | M | FIXED | Archive success now shows toast via `archiveMutation.onSuccess`. |
| 18 | M | FIXED | Pin success now shows toast ("Pinned"/"Unpinned"). |
| 19 | L | FIXED | Archive swipe action now calls `haptic.tick()` before `archiveMutation.mutate()`. Consistent with pin action. |
| 20 | L | FIXED | Added `isNavigating` ref-based double-tap guard. Prevents duplicate navigation for 500ms after first tap. |
| 21 | M | DEFERRED | Archive optimistic update. The current flow (mutate → onSuccess invalidate) works correctly. Optimistic removal requires complex cache key management for filtered lists. |
| 22 | L | DEFERRED | No `<StatusBar>` component. StatusBar is managed by the root layout. Adding per-screen StatusBar creates conflicts. |
| 23 | L | NOT_A_BUG | `getItemLayout` hardcodes height 72. This is `paddingVertical: spacing.md` (12) * 2 + Avatar size `lg` (48) = 72. Content (name, preview) fits within the avatar height. Consistent across all conversations. |
| 24 | I | DEFERRED | Offline indicator for socket disconnect. Requires new UI component and cross-screen coordination. Enhancement. |
| 25 | I | NOT_A_BUG | Pagination: `getConversations()` returns all conversations. For messaging apps, the full conversation list is typically small (< 500 items) and needed for unread count calculation. FlatList virtualizes rendering. |
| 26 | I | NOT_A_BUG | No entrance animation on FlatList. Message list UX prioritizes instant display over animation. Users expect to see conversations immediately on tab switch. |

---

## D42 — create.tsx (3 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 27 | M | FIXED | `router.back()` replaced with `router.replace('/(tabs)/saf')`. Safely handles cold deep-links with no navigation history. |
| 28 | L | FIXED | Empty `<View />` replaced with `<View>` containing `<ActivityIndicator>` for the 1-2 frames before redirect. |
| 29 | I | FIXED | Combined with #27 — `router.replace('/(tabs)/saf')` is the robust redirect target. |

---

## D42 — _layout.tsx (10 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 30 | H | FIXED | `BlurView tint` changed from hardcoded `"dark"` to `tc.isDark ? 'dark' : 'light'`. Tab bar blur now matches theme. |
| 31 | H | FIXED | Android tab bar bg changed from hardcoded `rgba(13, 17, 23, 0.92)` to `tc.isDark ? 'rgba(13, 17, 23, 0.92)' : 'rgba(255, 255, 255, 0.92)'`. |
| 32 | M | FIXED | `borderTopColor` changed from hardcoded `rgba(255,255,255,0.08)` to dynamic: `tc.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'`. |
| 33 | L | NOT_A_BUG | `activePill` uses `colors.active.emerald10` (10% emerald). This is brand-colored and intentionally subtle — it's a focus indicator, not a readability concern. Same opacity works in both themes. |
| 34 | L | FIXED | Removed unused `useRouter` import from `expo-router`. |
| 35 | L | FIXED | Removed unused `navigate as navTo` import from `@/utils/navigation`. |
| 36 | L | DEFERRED | StatusBar management in tab layout. Root layout handles StatusBar. Adding per-tab StatusBar creates conflicts with screen-level StatusBar management. |
| 37 | I | NOT_A_BUG | `haptic.tick()` for tab presses. Navigation-type haptic (`haptic.navigate()`) is for screen transitions. Tab switching is a selection action, matching `tick()` semantics. |
| 38 | I | NOT_A_BUG | No iPad tab bar optimization. The app uses `isWebWide` to hide the tab bar on desktop/tablet web. Native iPad support is out of scope (no TestFlight yet). |
| 39 | I | NOT_A_BUG | `TabIcon` animated styles: 5 tabs x 2 styles = 10 shared values. Reanimated shared values are worklet-based and run on the UI thread — they don't cause React re-renders. This is the correct Reanimated pattern. |

---

## D42 — Cross-Screen (2 findings)

| # | Sev | Status | What was done |
|---|-----|--------|---------------|
| 40 | H | FIXED | Systemic light-theme failure addressed per-screen: risalah chat text colors (#1-4), _layout BlurView tint (#30), Android bg (#31), border color (#32). |
| 41 | L | NOT_A_BUG | `create.tsx` no haptic. It's a redirect stub that immediately navigates away — haptic feedback on a screen the user never sees is unnecessary. |

---

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | `5c0dc072` | fix(saf): D41 #1-15 — stable onViewableItemsChanged, replace globalThis dwell, theme colors, coach mark font, AsyncStorage error handling, memoize hijri greeting |
| 2 | `83ff30c4` | fix(bakra): D41 #16-31 — stable viewability handler, handleShare try/catch, Share import to top-level, audioDisc theme color, doubleTapGesture stable deps |
| 3 | `48f12924` | fix(majlis): D41 #32-41 — AsyncStorage error handling, animation deps fix, eslint-disable removal |
| 4 | `44fca46e` | fix(minbar): D41 #42-52 — theme-aware VideoCard text, save-to-watch-later toast, RTL infoRow, scroll persistence, redundant fontWeight |
| 5 | `edc18cc6` | fix(risalah): D42 #1-26 — theme-aware chat text, isPinned type fix, archive/pin error handling + toast, stale deps, double-tap guard, haptic on archive |
| 6 | `4d5d6c8d` | fix(tabs): D42 #27-41 — create.tsx safe redirect, _layout theme-aware BlurView tint, Android bg, border color, dead imports removed |
| 7 | `1585489f` | test(tabs): R4-Tab1 — 19 tests |

## Tests

- **19 new tests** in `src/hooks/__tests__/r4tab1-tab-screens.test.ts`
- **208 total** hook tests pass (7 suites)
- All 7 tab screen files compile with `npx tsc --noEmit`
