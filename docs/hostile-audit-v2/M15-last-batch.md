# M15 — Last Batch Screens Hostile Audit

**Date:** 2026-04-05
**Scope:** 15 files in `apps/mobile/app/(screens)/`
**Auditor:** Claude Opus 4.6 (hostile, line-by-line)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 9 |
| Medium | 19 |
| Low | 14 |
| Info | 8 |
| **Total** | **52** |

---

## Findings

### CRITICAL

#### C1 — link-child-account.tsx: No auth verification before linking child account
**File:** `link-child-account.tsx` **Lines:** 63-74
**Issue:** The `linkMutation` calls `parentalApi.linkChild({ childUserId, pin })` without any server-side or client-side verification that the current user is actually the parent. Any authenticated user can search for any other user and link them as a "child" account. The PIN is set by the linker, not confirmed by the child. There is no consent flow from the child account.
**Impact:** Account takeover vector. A malicious user could link any user as their child, potentially gaining parental controls over an unwitting victim's account.
**Fix:** Require server-side verification: (1) child must confirm the link via a code/notification, (2) age verification gate, (3) rate-limit link attempts.

#### C2 — link-child-account.tsx: PIN stored in local state, sent in plaintext
**File:** `link-child-account.tsx` **Lines:** 38-39, 64
**Issue:** The parental PIN is stored as a plain `useState` string and sent to the server as `{ childUserId, pin }`. PINs in React state are visible in React DevTools, persist in JS heap, and if the API endpoint is HTTP (not HTTPS) the PIN travels in cleartext. There is no hashing or SecureStore usage.
**Impact:** PIN exposure via debugging tools, memory dumps, or network interception.
**Fix:** Hash PIN client-side before sending. Store PIN material in SecureStore, not component state. Ensure HTTPS-only enforcement.

---

### HIGH

#### H1 — account-switcher.tsx: 17 hardcoded `colors.text.*` in StyleSheet (L511-802)
**File:** `account-switcher.tsx` **Lines:** 511, 516, 521, 553, 566, 570, 615, 619, 633, 637, 693, 698, 730, 747, 756, 771, 802
**Issue:** The file uses `colors.text.primary`, `colors.text.secondary`, `colors.text.tertiary` directly in the static `StyleSheet.create()` instead of through `tc.*` theme colors. These colors are dark-mode-only constants. The screen will be unreadable in light mode.
**Impact:** Light mode completely broken for this screen.
**Fix:** Convert to `createStyles(tc)` pattern (like `restricted.tsx` or `pinned-messages.tsx`) so all text colors come from theme.

#### H2 — account-switcher.tsx: Hardcoded `#2D3548`, `#FFF`, `#000` colors (L486, 536, 599, 652, 656)
**File:** `account-switcher.tsx` **Lines:** 486, 536, 538, 599, 652, 656
**Issue:** Multiple hardcoded hex colors that ignore theming: `backgroundColor: '#2D3548'` on avatar containers, `color: '#FFF'` on badges, `backgroundColor: colors.error` on unread badge. These break light theme.
**Impact:** Visual artifacts in light mode.

#### H3 — pinned-messages.tsx: Crash if `item.sender` is null/undefined
**File:** `pinned-messages.tsx` **Lines:** 95, 106
**Issue:** `item.sender.displayName` is accessed without null check. If a message has no sender (e.g., system message, deleted user), this throws a TypeError and crashes the component.
**Impact:** Runtime crash on screen load if any pinned message has a missing sender.
**Fix:** Guard with `item.sender?.displayName ?? t('common.unknown')`.

#### H4 — followed-topics.tsx: Manual fetch/state management instead of react-query
**File:** `followed-topics.tsx` **Lines:** 37-67, 82-104
**Issue:** Uses manual `useState` + `useEffect` + `try/catch` for data loading and search, with manual `setLoading`, `setLoadError`, `setRefreshing` state management. Every other screen in scope uses `useQuery`/`useInfiniteQuery`. This is inconsistent and error-prone: no stale-while-revalidate, no cache, no deduplication.
**Impact:** Missing all react-query benefits (caching, background refresh, deduplication). Duplicated network requests on re-mount. Race conditions possible if component unmounts during fetch.

#### H5 — followed-topics.tsx: Search results race condition
**File:** `followed-topics.tsx` **Lines:** 92-101
**Issue:** The debounced search uses `setTimeout` + manual async fetch inside the timeout callback. If the user types "abc", then "abcd" within 400ms, the first timeout fires, starts a fetch for "abc", then the second timeout fires and starts "abcd". If "abc" response arrives after "abcd", the search results will show stale data for "abc" instead of "abcd".
**Impact:** Stale search results displayed to user.
**Fix:** Use `AbortController` per search, or use `useQuery` with `debouncedSearch` as key (like `link-child-account.tsx` does correctly).

#### H6 — create-carousel.tsx: uploadAbortRef race in parallel uploads (L228)
**File:** `create-carousel.tsx` **Lines:** 218-228
**Issue:** In the `Promise.all` loop, each slide sets `uploadAbortRef.current = abort`. Since all uploads run concurrently, only the LAST slide's abort function is stored. Calling `uploadAbortRef.current?.()` to cancel will only abort the last upload; all other uploads continue silently.
**Impact:** Cancel button during upload only cancels 1 of N uploads. The rest continue wasting bandwidth and creating orphaned R2 objects.
**Fix:** Collect all abort functions in an array and call all of them on cancel.

#### H7 — create-carousel.tsx: `colors.dark.borderLight` in static StyleSheet (L867)
**File:** `create-carousel.tsx` **Line:** 867
**Issue:** `borderColor: colors.dark.borderLight` directly references the dark theme color palette in a static StyleSheet. This bypasses theming entirely. In light mode, radio buttons will have dark-themed borders.
**Impact:** Broken light mode styling.

#### H8 — bookmark-folders.tsx: Delete silently swallows per-post move errors (L137)
**File:** `bookmark-folders.tsx` **Lines:** 134-137
**Issue:** When deleting a folder, each post is moved to 'default' collection via `Promise.all` with `.catch(() => {})`. Individual move failures are silently swallowed. If 50 posts fail to move, the user sees "success" but loses their bookmarks.
**Impact:** Data loss: bookmarks may be orphaned if move fails but folder is considered deleted.
**Fix:** Collect failed moves, show user which posts could not be moved, only proceed with folder removal if all moves succeed.

#### H9 — my-reports.tsx: `getStatusColor` uses hardcoded dark theme colors (L57-63)
**File:** `my-reports.tsx` **Lines:** 57-63
**Issue:** `getStatusColor` returns `colors.gold`, `colors.emerald`, `colors.text.tertiary` which are dark-theme-only static values. Also, the card at L82 uses `colors.gradient.cardDark` and `colors.active.white6` — all dark-theme-only.
**Impact:** Light mode: status badges and cards use wrong palette.

---

### MEDIUM

#### M1 — my-reports.tsx: `item.status` not translated in badge (L98)
**File:** `my-reports.tsx` **Line:** 98
**Issue:** `{item.status}` renders the raw enum value ("PENDING", "REVIEWING", "RESOLVED", "DISMISSED") directly. Not translated via `t()`.
**Impact:** Non-English users see untranslated English status strings.
**Fix:** Use `t('screens.my-reports.status.' + item.status.toLowerCase())`.

#### M2 — my-reports.tsx: `new Date(item.createdAt)` can crash on invalid date (L103)
**File:** `my-reports.tsx` **Line:** 103
**Issue:** If `item.createdAt` is null, undefined, or an invalid string, `new Date()` returns Invalid Date and `format()` from date-fns throws.
**Impact:** Runtime crash for corrupt data.

#### M3 — safety-center.tsx: `setTimeout` for navigation debounce (L90)
**File:** `safety-center.tsx` **Line:** 90
**Issue:** `setTimeout(() => { isNavigatingRef.current = false; }, 500)` is not cleaned up on unmount. If the component unmounts before 500ms, the ref update runs on an unmounted component (benign for refs, but the timeout itself leaks).
**Impact:** Minor memory leak. The timeout ref is not stored for cleanup.

#### M4 — restricted.tsx: `Alert.alert` for destructive action instead of BottomSheet
**File:** `restricted.tsx` **Lines:** 82-92
**Issue:** Uses `Alert.alert` for unrestrict confirmation. Per project rules, destructive confirmations should use BottomSheet for consistency. Non-critical since Alert.alert works, but inconsistent with the rest of the app.

#### M5 — restricted.tsx: `confirmUnrestrict` not wrapped in `useCallback`
**File:** `restricted.tsx` **Lines:** 80-93
**Issue:** `confirmUnrestrict` is a bare function defined in render scope but passed into `renderRestrictedItem`'s dependency array (L140). Since it's not memoized, `renderRestrictedItem` re-creates on every render, defeating `useCallback`.
**Impact:** FlatList re-renders all items on every state change.

#### M6 — link-child-account.tsx: PIN entry allows more than 4 digits via rapid tapping
**File:** `link-child-account.tsx` **Lines:** 113-136
**Issue:** `handlePinDigit` appends to `pin` state via string concatenation. In React, `setPin` batches asynchronously. If a user taps two digits extremely fast, both `pin + digit` operations read the same stale state and the PIN could end up with length 2 instead of 2 sequential appends. More critically, there is no guard preventing taps after length === 4.
**Impact:** Unlikely but possible malformed PIN state.
**Fix:** Use functional updater `setPin(prev => ...)` consistently (already done for `handlePinDelete` but not for `handlePinDigit`).

#### M7 — link-child-account.tsx: Search API called with user IDs, not usernames
**File:** `link-child-account.tsx` **Line:** 56-57
**Issue:** `searchApi.search(debouncedSearch, 'users')` returns User objects. The parent can search by username/display name. But there is no filter to exclude the current user from results. A user could link themselves as their own child.
**Impact:** Self-linking edge case.
**Fix:** Filter out current user ID from search results.

#### M8 — account-switcher.tsx: Auto-switch toggle state not persisted (L71, L393)
**File:** `account-switcher.tsx` **Lines:** 71, 393
**Issue:** `autoSwitchOnNotification` is `useState(false)` with no persistence. The TODO comment at L393 acknowledges this. Toggling the switch does nothing — it resets on every screen mount.
**Impact:** Feature appears functional but is completely non-functional. Misleading UI.

#### M9 — account-switcher.tsx: `spacing.xxl` inconsistency
**File:** `account-switcher.tsx` **Line:** 811
**Issue:** Uses `spacing.xxl` which is identical to `spacing['2xl']` (both 32). While it works, `xxl` is not in the CLAUDE.md documented spacing tokens (`xs=4, sm=8, md=12, base=16, lg=20, xl=24, 2xl=32`). Minor inconsistency.

#### M10 — maintenance.tsx: Health URL construction fragile (L16)
**File:** `maintenance.tsx` **Line:** 16
**Issue:** `const HEALTH_URL = \`${API_URL.replace('/api/v1', '')}/health/ready\``; If `API_URL` doesn't contain `/api/v1` (e.g., a different environment), `replace` is a no-op and the URL becomes `http://localhost:3000/health/ready` which may not be correct. Also, if `API_URL` contains `/api/v1` in the middle of a longer path, it replaces the first occurrence only.
**Impact:** Maintenance retry could hit wrong endpoint in edge cases.

#### M11 — share-receive.tsx: Nested `style={styles.scroll}` on both KeyboardAvoidingView and ScrollView (L329-330)
**File:** `share-receive.tsx` **Lines:** 329-330
**Issue:** Both `KeyboardAvoidingView` and `ScrollView` have `style={styles.scroll}` which is `{ flex: 1 }`. The nested `flex: 1` should work, but the `KeyboardAvoidingView` wraps `ScrollView` which already has `flex: 1`, creating redundant flex nesting.
**Impact:** Minor: potential layout issues on some Android devices where nested flex behaves differently.

#### M12 — bookmark-collections.tsx: `useQuery` returns non-paginated data but screen has no infinite scroll
**File:** `bookmark-collections.tsx` **Lines:** 33-37
**Issue:** Uses `useQuery` (not `useInfiniteQuery`) for `bookmarksApi.getCollections()`. If a user has 100+ collections, all are fetched in a single request. No pagination support.
**Impact:** Poor performance with many collections; potentially large payload.

#### M13 — pinned-messages.tsx: Duplicate `Alert` import (L4 and L17)
**File:** `pinned-messages.tsx` **Lines:** 4, 17
**Issue:** `Alert` is imported from `react-native` at line 4 (destructured) AND again at line 17 as a standalone import. The second import shadows the first.
**Impact:** No runtime error (duplicate import resolves fine), but dead code.

#### M14 — pinned-messages.tsx: `conversationId` could be undefined
**File:** `pinned-messages.tsx` **Lines:** 33, 46, 73
**Issue:** `useLocalSearchParams<{ conversationId: string }>()` returns `string | string[] | undefined`. The query is guarded with `enabled: !!conversationId` (L48), but `messagesApi.unpin(conversationId, messageId)` at L73 passes `conversationId` which may be undefined. TypeScript may not catch this since `useLocalSearchParams` returns a typed but potentially undefined value.
**Impact:** Runtime error if `handleUnpin` is somehow called when `conversationId` is undefined.

#### M15 — create-clip.tsx: `videoId as string` unsafe cast (L46)
**File:** `create-clip.tsx` **Line:** 46
**Issue:** `clipsApi.create(videoId as string, ...)` — `videoId` from `useLocalSearchParams` is `string | string[] | undefined`. The `as string` cast silences TypeScript but doesn't validate. If the screen is navigated to without `videoId`, this sends `undefined` as the video ID.
**Impact:** API call with invalid parameters, silent failure or server error.
**Fix:** Guard with early return if `!videoId || Array.isArray(videoId)`.

#### M16 — create-clip.tsx: Time adjustment accessibility labels misleading (L111-147)
**File:** `create-clip.tsx` **Lines:** 111, 122, 131, 142
**Issue:** The "decrease start time" button has `accessibilityLabel={t('accessibility.navigateBack')}` and "increase start time" has `accessibilityLabel={t('accessibility.seeMore')}`. These labels describe navigation, not time adjustment. Screen reader users will hear "Navigate back" when the button actually decreases the clip start time by 5 seconds.
**Impact:** Accessibility violation — misleading labels for VoiceOver/TalkBack users.

#### M17 — create-carousel.tsx: `reelsApi.create()` used for carousel (L240-256)
**File:** `create-carousel.tsx` **Lines:** 240-256
**Issue:** Carousels are created via `reelsApi.create()` with `isPhotoCarousel: true` and `videoUrl` set to the first image URL. This overloads the reels endpoint for a fundamentally different content type. If the backend validates `videoUrl` as an actual video, this will fail.
**Impact:** Potential API rejection or data model confusion.

#### M18 — followed-topics.tsx: Items rendered both in ListHeaderComponent and FlatList data
**File:** `followed-topics.tsx` **Lines:** 274-281, 347-349
**Issue:** `followedTopics` are rendered manually inside `renderListHeader` (L274-281) AND the FlatList data includes `suggestedTopics` filtered by followed. This means followed topics appear in the header but are ALSO potentially in the FlatList data if the filtering logic doesn't perfectly exclude them. The `displayData` variable (L230-234) merges both but is only used when searching. Confusing dual rendering path.
**Impact:** Potential duplicate rendering of topics.

#### M19 — majlis-lists.tsx: `fonts.semibold` vs `fonts.bodySemiBold` inconsistency (L318, 336)
**File:** `majlis-lists.tsx` **Lines:** 318, 336, 348, 353, 375
**Issue:** Uses `fonts.semibold`, `fonts.bold`, `fonts.medium` instead of the canonical `fonts.bodySemiBold`, `fonts.bodyBold`, `fonts.bodyMedium`. While these are aliases (both resolve to the same font), the codebase convention per `mobile-screens.md` uses `fonts.body*` variants. Inconsistent.

---

### LOW

#### L1 — my-reports.tsx: Card uses `colors.gradient.cardDark` in static styles (L82)
**File:** `my-reports.tsx` **Line:** 82
**Issue:** `colors.gradient.cardDark` is hardcoded dark-gradient. Cards will look wrong in light mode.

#### L2 — safety-center.tsx: `colors.active.emerald10` hardcoded (L95)
**File:** `safety-center.tsx` **Line:** 95
**Issue:** `backgroundColor: colors.active.emerald10` is used in static style. This specific value may be acceptable across both themes but bypasses the theme system.

#### L3 — banned.tsx: No way to prevent back navigation
**File:** `banned.tsx` **Lines:** 38-70
**Issue:** A banned user can swipe back or press hardware back to return to the app. There is no `BackHandler` interception or navigation prevention. The banned screen is advisory, not enforced.
**Impact:** Banned users can potentially bypass the banned screen and continue using the app.
**Fix:** Use `useEffect` with `BackHandler.addEventListener` to prevent back navigation. Or handle ban enforcement at the navigation root level.

#### L4 — share-receive.tsx: `#A855F7` hardcoded color (L75)
**File:** `share-receive.tsx` **Line:** 75
**Issue:** Purple color `#A855F7` and its alpha variant `rgba(168, 85, 247, 0.1)` are not in the theme system.
**Impact:** Not theme-responsive.

#### L5 — bookmark-collections.tsx: `navigate()` utility instead of `router.push()` (L54)
**File:** `bookmark-collections.tsx` **Line:** 54
**Issue:** Uses `navigate('/(screens)/saved', { collection: item.name })` while every other screen in scope uses `router.push()`. Inconsistent navigation pattern.

#### L6 — bookmark-folders.tsx: `handleCreateFolder` fires `haptic.success()` before actual creation (L105)
**File:** `bookmark-folders.tsx` **Line:** 105
**Issue:** `haptic.success()` fires immediately, but the "creation" is just a toast explaining the collection is implicit. Success haptic for a no-op operation is misleading.

#### L7 — bookmark-folders.tsx: `BottomSheetItem` imported but unused (L15)
**File:** `bookmark-folders.tsx` **Line:** 15
**Issue:** `BottomSheetItem` is imported from `@/components/ui/BottomSheet` but never used.
**Impact:** Dead import.

#### L8 — pinned-messages.tsx: GlassHeader `leftAction.icon` passes JSX element instead of string (L140-141)
**File:** `pinned-messages.tsx` **Lines:** 140-141, 154-155, 173-174
**Issue:** `leftAction={{ icon: <Icon name="arrow-left" size="md" color={tc.text.primary} />, onPress: ... }}` passes a React element as `icon`. Every other screen in scope passes a string: `icon: 'arrow-left'`. If GlassHeader's type expects a string, this could cause type errors or unexpected rendering.

#### L9 — create-clip.tsx: No validation that `endTime > startTime` on submit
**File:** `create-clip.tsx` **Lines:** 42, 185
**Issue:** `isValid` checks `clipDuration >= 0.5` which indirectly validates `endTime > startTime`, but `adjustStart`/`adjustEnd` enforce `endTime >= startTime + 0.5`. If state somehow gets corrupted (e.g., concurrent state updates), the button could be enabled with invalid times.
**Impact:** Minimal — defense-in-depth concern.

#### L10 — account-switcher.tsx: `haptic` declared but `haptic.navigate()` is not called on back button
**File:** `account-switcher.tsx` **Line:** 170
**Issue:** GlassHeader `showBackButton` doesn't trigger haptic on back press, while every custom back button in other screens calls `haptic.navigate()` or at minimum the action.

#### L11 — create-carousel.tsx: Redundant `fontWeight` alongside `fontFamily` (L793, 812, 820, 829, 859)
**File:** `create-carousel.tsx` **Lines:** 793, 812, 820, 829, 859
**Issue:** Styles declare both `fontFamily: fonts.bodyBold` and `fontWeight: '700'`. Since the font family already encodes the weight (DMSans_700Bold), the explicit `fontWeight` is redundant and can cause platform inconsistencies (Android may double-apply weight).

#### L12 — account-switcher.tsx: `fontWeight` used instead of `fontFamily` throughout (L511, 538, etc.)
**File:** `account-switcher.tsx` **Lines:** 511, 538, 565, 614, etc. (8 instances)
**Issue:** Uses `fontWeight: '600'`, `fontWeight: '700'` etc. without corresponding `fontFamily` from the fonts system. Per mobile-screens.md rules, font weights should come from `fonts.*` family definitions, not raw `fontWeight`.

#### L13 — create-carousel.tsx: Custom toggle components instead of RN `Switch` (L692-703)
**File:** `create-carousel.tsx` **Lines:** 692-703
**Issue:** Implements a manual toggle with `View` styles (`toggleTrack`, `toggleThumb`, `toggleActive`) instead of using the native `Switch` component. Other screens (majlis-lists, account-switcher) correctly use `<Switch>`. The custom toggle lacks accessibility announcements for state changes.

#### L14 — majlis-lists.tsx: `navigate()` utility for list detail (L109)
**File:** `majlis-lists.tsx` **Line:** 109
**Issue:** Same as L5 — uses `navigate()` instead of `router.push()`. Inconsistent with other screens.

---

### INFO

#### I1 — banned.tsx: No ban reason displayed
**File:** `banned.tsx`
**Issue:** The screen shows a generic "you are banned" message but doesn't display the reason or duration. Users have no idea why they were banned.
**Suggestion:** Fetch and display ban reason + expiry from the API.

#### I2 — maintenance.tsx: No auto-retry/polling
**File:** `maintenance.tsx`
**Issue:** User must manually tap retry. No automatic polling (e.g., every 30s) to detect when the server comes back.
**Suggestion:** Add auto-retry with exponential backoff.

#### I3 — share-receive.tsx: No validation of shared content URIs
**File:** `share-receive.tsx` **Lines:** 241-246
**Issue:** `sharedImage`, `sharedVideo`, `sharedUrl` from route params are used directly without validation. A malicious share intent could pass arbitrary data.
**Suggestion:** Validate URI schemes and content types.

#### I4 — bookmark-folders.tsx: Delete folder moves all posts to 'default' collection
**File:** `bookmark-folders.tsx` **Lines:** 130-137
**Issue:** Design decision: deleting a folder moves all bookmarks to 'default' instead of deleting them. This is probably intentional, but the user is not informed that their bookmarks are being moved.
**Suggestion:** Update the alert message to explain bookmarks will be moved to default.

#### I5 — followed-topics.tsx: `FadeInDown` animation delay not capped for search results
**File:** `followed-topics.tsx` **Line:** 150
**Issue:** `FadeInDown.delay(index * 40)` — if search returns 100 results, the last item's animation delay is 4000ms. This is uncapped unlike other screens that use `Math.min(index, 10) * delay`.
**Suggestion:** Cap with `Math.min(index, 10) * 40`.

#### I6 — create-clip.tsx: `formatTime` not locale-aware
**File:** `create-clip.tsx`
**Issue:** Time formatting uses a utility function but timestamp display (`formatTime`) shows seconds in a fixed format regardless of locale.

#### I7 — account-switcher.tsx: `signOut` error silently caught (L158-159)
**File:** `account-switcher.tsx` **Lines:** 158-159
**Issue:** `signOut()` failure is caught and ignored with a comment "non-critical". While this may be true, the user gets no feedback if sign-out fails.

#### I8 — create-carousel.tsx: `MusicPicker` rendered outside `SafeAreaView` (L738-746)
**File:** `create-carousel.tsx` **Lines:** 738-746
**Issue:** `MusicPicker` modal/sheet is rendered after the closing `</SafeAreaView>` tag but inside `<ScreenErrorBoundary>`. This works if MusicPicker is an absolute-positioned overlay, but it's outside the safe area context.

---

## Cross-Cutting Issues

### Theme Compliance Summary
| File | Static `colors.*` in styles | Uses `createStyles(tc)` | Light mode ready |
|------|----------------------------|------------------------|-----------------|
| my-reports.tsx | Yes (gradient, active) | No | No |
| safety-center.tsx | Yes (emerald10) | No | Mostly |
| restricted.tsx | Yes (gold15, white6) | Yes | Mostly |
| link-child-account.tsx | Yes (emerald in pinDot) | No | No |
| account-switcher.tsx | **17 hardcoded colors.text.*** | No | **Broken** |
| maintenance.tsx | No | No | Yes |
| banned.tsx | No | No | Yes |
| share-receive.tsx | Yes (#A855F7, info) | Yes | Mostly |
| bookmark-collections.tsx | Yes (white8) | No | Mostly |
| bookmark-folders.tsx | Yes (gold) | No | Mostly |
| pinned-messages.tsx | Yes (gradient, white6) | Yes | Mostly |
| followed-topics.tsx | Yes (emerald10) | No | Mostly |
| majlis-lists.tsx | Yes (gradient, white6) | No | Mostly |
| create-clip.tsx | Yes (emerald) | No | Mostly |
| create-carousel.tsx | Yes (dark.borderLight) | No | **Broken** |

**Worst offenders for light mode:** account-switcher.tsx (17 hardcoded dark colors), create-carousel.tsx (colors.dark.borderLight direct reference).

### Missing ScreenErrorBoundary on Error/Loading Branches
| File | Error state wrapped | Loading state wrapped |
|------|-------------------|--------------------|
| my-reports.tsx | No | No |
| restricted.tsx | No | No |
| bookmark-collections.tsx | No | No |
| bookmark-folders.tsx | No | No |
| pinned-messages.tsx | No | No |
| majlis-lists.tsx | No | No |
| followed-topics.tsx | No | No |

These files wrap the main content in `ScreenErrorBoundary` but return error/loading states OUTSIDE the boundary. If an error occurs during error state rendering, it will be uncaught.
