# M04 — Discovery & Feed Screens (Hostile Audit)

**Scope:** `discover.tsx`, `trending-audio.tsx`, `hashtag-explore.tsx`, `why-showing.tsx`, `search.tsx`, `search-results.tsx`, `saved.tsx`, `archive.tsx`, `downloads.tsx`, `watch-history.tsx`

**Auditor:** Opus 4.6 (1M context) | **Date:** 2026-04-05

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 11 |
| Medium | 19 |
| Low | 14 |
| Info | 6 |
| **Total** | **53** |

---

## Findings

### CRITICAL

#### C1. `discover.tsx` L558-561 — Hardcoded dark-mode colors in static StyleSheet override theme

The `styles` object is created with `StyleSheet.create` at module scope using `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.border`, `colors.dark.borderLight`, `colors.dark.bgElevated`, `colors.dark.surface`, `colors.text.primary`, `colors.text.tertiary` throughout lines 558-809. These are dark-theme-only values. Unlike other files in scope that use `createStyles(tc)`, this file uses a module-level `const styles = StyleSheet.create(...)`. The inline `{ backgroundColor: tc.bg }` on the container (L467) patches one property, but every child component rendered with `styles.categoryPill` (L580-587), `styles.gridItem` (L746-752), `styles.hashtagChipGold` (L706-716), `styles.featuredCard` (L608-614), `styles.featuredAvatarPlaceholder` (L653-658), `styles.categoryText` (L593-596), `styles.hashtagText` (L718-720), `styles.hashtagCount` (L728-733), `styles.placeholder` (L758-760), `styles.sectionTitle` (L680-686), `styles.footerText` (L786-789) uses hardcoded dark palette. **Light theme renders dark cards on light background -- unreadable.**

#### C2. `hashtag-explore.tsx` L68-69 — Hardcoded dark gradient breaks light theme

`colors.gradient.cardDark` is passed to `LinearGradient` at L69. This dark gradient is used for every row (L68-92). In light mode, every hashtag row will have a dark overlay background, creating a jarring visual. The same file hardcodes `colors.active.white6` for borders (L206, L228). These are dark-theme-only tokens.

#### C3. `search-results.tsx` L49-50, L110-111 — `createStyles(tc)` called inside every render of sub-components

`HashtagRow`, `ReelGridItem`, and `UserRow` each call `useMemo(() => createStyles(tc), [tc])`. Since `tc` is a new object reference on every render (not referentially stable), `createStyles` runs on every render for every row. With 50+ search results, this creates 50+ `StyleSheet.create` calls per frame. This is a perf regression that causes jank during scroll. The memoization is broken because `tc` is not referentially stable.

---

### HIGH

#### H1. `discover.tsx` L389-417 — `featuredItems` useMemo dependency `exploreItems` is a new array every render

`exploreItems` is computed at L386 via `.flatMap()` which creates a new array reference every render. Since it is in the `useMemo` dependency array at L417, `featuredItems` recomputes every single render, defeating the memoization. This causes wasteful re-renders of `FeaturedSection` on every scroll event.

#### H2. `discover.tsx` L456-463 — `renderExploreItem` has empty dependency array but captures nothing stale

Dependency array is `[]` but the function references `isFeatureIndex` (module-level, safe). However, because the array is empty, `FadeInUp.delay(index * 40)` animations will replay even when data hasn't changed (the callback is stable, but React may still re-render the items). More importantly, this means any future closures added would be stale. **Low immediate risk, but high maintenance risk.**

#### H3. `trending-audio.tsx` L107-169 — `renderItem` is not wrapped in `useCallback`

`renderItem` is defined as a plain function inside the component body (L107). This means FlatList receives a new function reference every render, defeating `removeClippedSubviews` optimization and potentially causing unnecessary re-renders of all visible cells.

#### H4. `search.tsx` L265-269 — Unsafe type coercions with `as unknown as`

Lines 265-269 use complex chains like `(p.data as Post[] | undefined) ?? (p as unknown as { posts?: Post[] }).posts ?? []`. This bypasses TypeScript's type system entirely. If the API response shape changes, these casts will silently pass wrong data through with no error. This pattern is repeated for threads, reels, videos, and channels.

#### H5. `why-showing.tsx` L44-53 — `reasonIconMap` recreated every render

`reasonIconMap` is defined inside the `WhyShowingContent` function body (L44-53). It should be at module scope since it's a static lookup table. Currently, a new object is created every render.

#### H6. `search.tsx` L167-178 — AsyncStorage loaded without error handling for malformed data

`loadHistory` at L167-178 catches JSON.parse errors but silently ignores them (comment says `// ignore`). If search-history is corrupted (e.g., not an array), `setSearchHistory` could receive a non-array value. The `JSON.parse` result is not validated to be an array before setting state.

#### H7. `saved.tsx` L339-358 — `useCallback` depends on `navigateOnce` which is not stable

`renderSavedPostItem` (L339) and `renderSavedReelItem` (L349) depend on `navigateOnce` in their dependency array. But `navigateOnce` is a plain function defined at L150-156 (not wrapped in `useCallback`), so it is a new reference every render. This makes the `useCallback` useless -- the render callbacks change every render.

#### H8. `downloads.tsx` L467 — Static StyleSheet uses hardcoded `colors.dark.bg` and `colors.dark.*` tokens

Line 467: `container: { flex: 1, backgroundColor: colors.dark.bg }`. Lines 494-523 use `colors.text.primary`, `colors.text.tertiary`, `colors.text.secondary`, `colors.dark.surface`, `colors.dark.border`. These are dark-mode-only. While the container gets `tc.bg` override inline, many nested styles (storageTitle L494, storageLabel L495, chipText L523, itemTitle L558, itemSize L560, itemStatus L561) use hardcoded dark text colors that will be invisible in light mode.

#### H9. `search-results.tsx` L362-363 — `followMutation` in `renderPeopleItem` dependency array

`followMutation` object from `useMutation` is not referentially stable across renders. Including it in `useCallback` dependency at L363 means `renderPeopleItem` is recreated every render, causing all `UserRow` components to re-render on any state change.

#### H10. `archive.tsx` L100-101, L113-114 — `haptic.error()` called for non-error user actions

`handleUnarchive` (L100) calls `haptic.error()` before showing the confirmation alert. This is a UX antipattern -- the user hasn't made an error; they intentionally tapped unarchive. `haptic.error()` should only be used for actual error states. Same issue at `handleDelete` (L113).

#### H11. `why-showing.tsx` L252 — Wrong accessibility label on "See less" button

Line 252: `accessibilityLabel={t('accessibility.togglePasswordVisibility')}`. This is a copy-paste error. The "See less like this" button's accessibility label says "toggle password visibility", which is semantically wrong and will confuse screen reader users.

---

### MEDIUM

#### M1. `discover.tsx` L33-35 — `CATEGORY_KEYS` has hardcoded English category names

Categories like `'food'`, `'fashion'`, `'sports'`, `'tech'`, `'islamic'`, `'art'` are sent as API parameters. While the display labels are i18n'd (L347-355), the API contract is implied by these string constants. If the backend uses different category slugs, this silently fails.

#### M2. `discover.tsx` L346-356 — `CATEGORIES` array recreated every render

`CATEGORIES` is defined inside the component function body. Since it calls `t()`, it can't easily be moved to module scope, but it should be wrapped in `useMemo([t])` to avoid recreating the array on non-language-change renders.

#### M3. `trending-audio.tsx` L99-103 — `formatDuration` recreated every render

`formatDuration` is defined as a plain function inside the component body. It has no dependencies and should be at module scope (like `watch-history.tsx` does correctly at L41-44).

#### M4. `trending-audio.tsx` L105 — `formatUsage` recreated every render

Same issue: `formatUsage` (L105) is a closure over `t` but could be made stable with `useCallback` or called inline.

#### M5. `hashtag-explore.tsx` L62 — `hashtags` falls back to empty array for search but may have wrong shape

`searchResults || []` at L62 -- if `searchResults` is `undefined` after a failed query, `hashtags` becomes `[]`. But there's no error state for the search branch (only `isTrendingError` is checked at L64). If search fails, user sees empty state with no retry option.

#### M6. `why-showing.tsx` L55-113 — Data fetching in `useEffect` instead of React Query

The entire data loading logic uses manual `useEffect` + `setState` pattern (L55-113) instead of React Query which is used everywhere else in the codebase. This means: no caching, no automatic retry, no stale-while-revalidate, no refetch on focus. Inconsistent with all other screens in scope.

#### M7. `search.tsx` L254-262 — `showExplore` condition can be true while `isFocused` is changing

`showExplore` at L254 is `query.length === 0 && !isFocused`. But `exploreQuery` is `enabled: showExplore` (L258). When user taps the search box (focus), there's a brief flash where `showExplore` transitions from true to false, and the explore data disappears instantly. No graceful transition.

#### M8. `search-results.tsx` L272 — `handleRefresh` does not await `refetch()`

`handleRefresh` (L272-290) calls `refetch()` without `await`. The `BrandedRefreshControl` at L479 uses `isRefreshing.people` which relies on React Query's internal `isRefetching` state. This is actually correct for the spinner, but the function signature returns `void` (not `Promise<void>`), which means the pull-to-refresh indicator may not properly synchronize.

#### M9. `saved.tsx` L206-228 — Four separate `onRefresh*` handlers with identical pattern

`onRefreshPosts`, `onRefreshThreads`, `onRefreshReels`, `onRefreshVideos` (L206-228) are copy-pasted with the same pattern. Should be a single `onRefresh(queryObj, setFn)` helper. This is a maintenance burden and violates DRY.

#### M10. `archive.tsx` L46-49 — `useQuery` returns stories as empty array default but shape may differ

`const { data: stories = [] }` at L46 defaults to `[]`. But if the API returns `{ data: Story[] }` (paginated), this would set `stories` to the wrapper object, not the array. The default only works if the API returns a bare array. No type annotation on the query function return.

#### M11. `archive.tsx` L128-129 — `accessibilityLabel` for story grid items says "play audio"

Line 128: `accessibilityLabel={t('accessibility.playAudio')}` -- archive items are stories (images/videos), not audio. Wrong semantic label for screen readers.

#### M12. `archive.tsx` L148 — `renderGridItem` useCallback missing `ITEM_SIZE` and `tc.bgCard` dependencies

Dependencies are `[handleStoryPress, handleStoryLongPress]` but the callback uses `ITEM_SIZE` (L130) and `tc.bgCard` (L130). These are not in the dependency array, so if screen width changes (rotation) or theme changes, the grid items render with stale sizes/colors.

#### M13. `downloads.tsx` L237-238 — `useTranslation()` called twice in same component

Line 230: `const { t } = useTranslation();` and Line 238: `const { isRTL } = useTranslation();`. The hook is called twice. Should be a single destructure: `const { t, isRTL } = useTranslation();`.

#### M14. `downloads.tsx` L400 — `totalBytes` hardcoded to 1GB (1_073_741_824)

Line 400: `totalBytes={1_073_741_824}`. This hardcoded 1GB storage limit is not from the API. If the actual storage limit changes or differs per device, the bar will show incorrect percentage. Should come from the storage API response or a config constant.

#### M15. `downloads.tsx` L302 — Pause/resume actions are no-ops

Lines 301-302: `// Pause/resume requires a native download manager module`. The `handleAction` callback accepts `'pause'` and `'resume'` actions and renders buttons for them (L201-209), but does nothing. Users can tap pause/resume with no feedback that it didn't work.

#### M16. `watch-history.tsx` L166 — `handleClear` useCallback depends on `watchHistoryQuery` but is missing `t` and `haptic`

Dependency array at L166 is `[watchHistoryQuery]` but the function uses `t` (L145, L147, L156, L160), `haptic` (L155, L159). These are missing from deps. If language changes or haptic instance changes, stale closures will be used.

#### M17. `watch-history.tsx` L177-182 — `renderHistoryItem` depends on `handleVideoPress` which is not stable

`handleVideoPress` (L169-175) is a plain function, not wrapped in `useCallback`. It's listed in `renderHistoryItem`'s dependency array at L182. This means `renderHistoryItem` changes every render, causing all list items to re-render.

#### M18. `search-results.tsx` L363 — `renderPeopleItem` captures `followMutation.mutate` which changes identity

The `onFollow` prop passes `followMutation.mutate` which is a new function reference from useMutation on each render. This triggers re-render of every `UserRow` on any state change.

#### M19. `search.tsx` L648 — Hashtag keyExtractor uses index: `ht-${i}`

Line 648: `keyExtractor={(item, i) => item.type === 'user' ? item.data.id : \`ht-${i}\`}`. Using index as key for hashtags means React can't properly reconcile when the list changes (items reorder or filter). Should use `item.data.id` or `item.data.name`.

---

### LOW

#### L1. `discover.tsx` L98 — `colors.gold` hardcoded color in hashtag chip Icon

Line 98: `color={colors.gold}`. This is a brand color, not a theme token. Acceptable for brand elements but inconsistent with the theme-first approach of other screens.

#### L2. `discover.tsx` L151 — Hardcoded white `#fff` in category pill active state

Line 151: `color={isActive ? '#fff' : tc.text.primary}`. The `#fff` is hardcoded. Should use a theme token for text-on-emerald contrast.

#### L3. `trending-audio.tsx` L139 — "loader" icon used for playing state instead of "pause"

Line 139: `name={playingId === item.id ? 'loader' : 'play'}`. When audio is playing, the icon shows a loader spinner, not a pause icon. Users expect a pause button to stop playback, not a spinning loader that suggests loading.

#### L4. `trending-audio.tsx` — No pagination (useQuery, not useInfiniteQuery)

The screen uses `useQuery` (L86) to fetch all trending audio at once. If there are hundreds of tracks, this loads everything in one request with no infinite scroll. Other screens (saved, search-results, downloads, watch-history) all use `useInfiniteQuery`.

#### L5. `hashtag-explore.tsx` L101 — `accessibilityLabel` uses key `saf.goBack` instead of `accessibility.goBack`

Lines 101, 121: `accessibilityLabel: t('saf.goBack')`. Other screens consistently use `t('accessibility.goBack')`. `saf.goBack` may not exist in all 8 language files, leading to raw key display.

#### L6. `why-showing.tsx` L72-73 — Fallback default text in `t()` calls throughout file

Lines 72-73, 80-95, 99-105, 126, 147, 156, 160, 200-206, 217, 239, 247, 253, 259. The `t()` function is called with inline English fallback strings like `t('whyShowing.reasonFollow', 'You follow this creator')`. While this prevents broken UI, it means the i18n keys may not exist in the JSON files, and the English fallback will show for all 8 languages.

#### L7. `search.tsx` L10 — `formatDistanceToNowStrict` imported but never used

Line 10: `import { formatDistanceToNowStrict } from 'date-fns';` -- this import is not used anywhere in the file. Dead import that increases bundle size.

#### L8. `search.tsx` L11 — `getDateFnsLocale` imported but never used

Line 11: `import { getDateFnsLocale } from '@/utils/localeFormat';` -- unused import.

#### L9. `search.tsx` L24 — `postsApi` and `feedApi` both imported; `postsApi` is unused

Line 24: `import { searchApi, postsApi, feedApi } from '@/services/api';`. `postsApi` is not used anywhere in the file.

#### L10. `search.tsx` L27 — `SearchResults` type imported but never used

Line 27: `import type { ..., SearchResults } from '@/types';`. `SearchResults` is not referenced in the code.

#### L11. `saved.tsx` L19 — `useUser` from Clerk imported but `user?.id` not used for queries

`useUser` is imported (L19) and `user` is destructured (L147). However, `user?.id` and `user?.username` are only used in `renderSavedThreadItem` (L345-348) for `viewerId` prop. The saved queries don't include `userId` in their query keys, meaning the cache is shared across users if they log out and log in as different users.

#### L12. `archive.tsx` L20 — `useStore` used to get `user?.id` but query is `enabled: !!userId`

If the store's user is null (logged out state), the query is disabled. But there's no UI feedback that the screen requires authentication. User sees a loading skeleton forever.

#### L13. `downloads.tsx` L429 — Share BottomSheetItem `onPress` is empty (placeholder)

Lines 429-434: The "Share" option has `onPress` that only closes the sheet with a comment `// Share functionality - placeholder for share sheet`. No toast or feedback that the feature isn't implemented.

#### L14. `watch-history.tsx` L128-129 — `accessibilityLabel` missing on channel avatar area

The `VideoCard` component (L49-111) has accessibility on the outer `Pressable` but the channel info area (L89-107) is not separately accessible. The channel name and avatar could benefit from an `accessibilityHint` indicating it shows channel info.

---

### INFO

#### I1. `discover.tsx` L276-278 — Navigation debounce uses `setTimeout` + `useRef`

`isNavigatingRef` with 500ms `setTimeout` (L277-279) is a common pattern but could be replaced with a `useThrottledCallback` hook for cleaner code. Same pattern in `saved.tsx` L149-156 and `watch-history.tsx` L168-175.

#### I2. `search.tsx` — 992 lines, largest file in scope

The search screen is 992 lines with 7 sub-components inline and 8 query hooks. Consider extracting `UserRow`, `VideoRow`, `ChannelRow` into separate files and the query logic into a custom `useSearchQueries` hook.

#### I3. `search-results.tsx` — Duplicates much of `search.tsx` functionality

`search-results.tsx` (746 lines) has overlapping logic with `search.tsx` (992 lines). Both have UserRow, tab-based search, infinite queries for posts/threads/reels. Consider consolidating.

#### I4. `why-showing.tsx` L239 — "Not interested" button accessibilityLabel is `t('accessibility.close')` instead of something descriptive

While not technically wrong, `accessibility.close` doesn't convey the destructive "not interested" intent.

#### I5. `saved.tsx` L201-204 — Four separate `refreshing*` state variables

`refreshingPosts`, `refreshingThreads`, `refreshingReels`, `refreshingVideos` -- four booleans that could be a single `refreshingTab: Tab | null` state.

#### I6. `downloads.tsx` L148-149 — `item as unknown as Record<string, unknown>` double cast for title

Lines 148-149 and 172-173 use `(item as unknown as Record<string, unknown>).title as string` to access `title` on `OfflineDownload`. This suggests the `OfflineDownload` type is missing a `title` field. The type should be fixed rather than casting.

---

## Files Summary

| File | Lines | Findings | Most Severe |
|------|-------|----------|-------------|
| `discover.tsx` | 809 | 7 | C1 |
| `trending-audio.tsx` | 338 | 4 | H3 |
| `hashtag-explore.tsx` | 257 | 3 | C2 |
| `why-showing.tsx` | 395 | 5 | H11 |
| `search.tsx` | 992 | 9 | H4, H6 |
| `search-results.tsx` | 746 | 5 | C3, H9 |
| `saved.tsx` | 580 | 5 | H7 |
| `archive.tsx` | 301 | 4 | M12 |
| `downloads.tsx` | 599 | 5 | H8, M15 |
| `watch-history.tsx` | 353 | 4 | M16, M17 |

---

## Top 5 Fix Priorities

1. **C1+C2+H8** -- Hardcoded dark theme colors in `discover.tsx`, `hashtag-explore.tsx`, `downloads.tsx`. Convert static `StyleSheet.create` to `createStyles(tc)` pattern used by other files.
2. **H11** -- Wrong accessibility label in `why-showing.tsx` L252. Copy-paste bug saying "toggle password visibility" on "See less" button.
3. **C3+H1+H7+H9** -- Broken `useMemo`/`useCallback` dependencies across multiple files. `tc` not referentially stable, `navigateOnce` not memoized, `followMutation` not stable.
4. **H4** -- Unsafe `as unknown as` type coercions in `search.tsx` L265-269. Fix API types or add runtime validation.
5. **M6** -- `why-showing.tsx` uses manual `useEffect` data fetching instead of React Query. Inconsistent with entire codebase.
