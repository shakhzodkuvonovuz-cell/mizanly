# M06 — Messaging Screens Hostile Audit

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** 9 messaging screens in `apps/mobile/app/(screens)/`
**Method:** Line-by-line read of every file, checklist applied per screen

---

## new-conversation.tsx (420 lines)

### NC-1 [Medium] `as User` type assertion hides missing fields (lines 38, 48)
`extractContact()` builds partial objects and casts them with `as User`. If the `User` type grows new required fields, these casts will silently produce incomplete objects that pass the compiler but crash at runtime when accessed.

### NC-2 [Low] `renderUserRow` dependency array is missing `styles` (line 225)
`useCallback` for `renderUserRow` references `styles` from closure but omits it from the dependency array. Since `styles` is derived from `tc` via `useMemo`, a theme change could leave the callback using stale styles in the same render cycle. `[isRTL, haptic, handleContactPress, dmMutation, t]` should include `styles` and `tc`.

### NC-3 [Low] `handleContactPress` is not memoized but used in `renderUserRow` deps (line 225)
`handleContactPress` is a plain function defined inside the component body (line 150). Every render creates a new reference, which invalidates the `useCallback` for `renderUserRow` every time. Should be wrapped in `useCallback`.

### NC-4 [Info] `refreshing={false}` on BrandedRefreshControl (lines 326, 340)
Both FlatList and SectionList pass `refreshing={false}` hardcoded. The pull-to-refresh animation will never show the spinner, making it look broken on slow connections. Should use actual fetching state from the queries.

### NC-5 [Info] Dead styles (lines 407-418)
`suggestionsLabel`, `empty`, `emptyText`, `hint`, `hintText` are defined in the stylesheet but never used (replaced by `EmptyState` components). Dead code.

### NC-6 [Low] No `accessibilityLabel` on SectionList header (line 348-350)
The `renderSectionHeader` renders a plain `Text` with no accessibility role or label. Screen readers won't announce it as a section heading.

### NC-7 [Medium] `FadeInUp.delay(Math.min(index, 10) * 60)` creates animation on every render (line 185)
`renderUserRow` creates new Reanimated `entering` props on every call. When combined with `useCallback` the index still changes, so the animation object is recreated. For long lists this generates excessive Reanimated worklets. Cap is good but the animation should ideally be stable or skipped for recycled items.

---

## conversation-info.tsx (1149 lines)

### CI-1 [High] `pickAvatar` has no try/catch around `ImagePicker.launchImageLibraryAsync` (lines 151-176)
If the user denies photo library permission, `launchImageLibraryAsync` can throw on some Android devices. The outer function has no try/catch protecting the image picker call itself (only the upload path is wrapped). This will cause an unhandled promise rejection.

### CI-2 [Medium] `error` parameter unused in `removeMemberMutation.onError` (line 128)
The `error` parameter is declared but never used: `onError: (error) => { ... }`. This is either a lint warning or should be used in the error toast for debugging.

### CI-3 [Medium] Block action uses `.then()/.catch()` instead of mutation (lines 706-708)
The block user action calls `blocksApi.block(other.user.id).then(...).catch(...)` directly inside an `Alert.alert` callback instead of using a proper `useMutation`. This bypasses React Query's loading/error states, has no retry, and won't invalidate relevant caches on success. Other actions on this screen correctly use mutations.

### CI-4 [Medium] Accessibility labels on action rows are semantically wrong (lines 543-643)
Multiple action rows reuse unrelated accessibility labels:
- Line 556: Pinned messages row uses `t('accessibility.addLocation')` -- wrong label
- Line 569: Media row uses `t('accessibility.pickImage')` -- misleading
- Line 607: Wallpaper row uses `t('accessibility.pickImage')` -- duplicate wrong label
- Line 595: Disappearing messages row has no `accessibilityLabel` at all

### CI-5 [Low] Static `styles` object uses hardcoded `colors.dark.*` (line 906, 909, 950, etc.)
The main `styles` StyleSheet at the bottom uses `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.border`, `colors.text.primary` directly instead of theme-aware `tc.*` values. This means these specific styles won't adapt to light theme if one is ever added. The JSX does use `tc` inline for some colors, creating an inconsistent mix.

### CI-6 [Low] `memberSearchQuery.isFetching` as refresh control (line 842)
Using `isFetching` as the `refreshing` prop means the spinner shows during background refetches too, not just user-initiated pulls. Minor UX issue.

### CI-7 [Info] No `SafeAreaView` bottom edge protection on main content
The `SafeAreaView` at line 295 uses `edges={['top']}` but the bottom padding relies on `insets.bottom + spacing.xl` in the ScrollView. This works but the BottomSheet overlays may clip content on notched devices.

### CI-8 [Medium] Avatar upload uses raw `fetch()` without timeout (lines 165-170)
The presigned URL upload uses bare `fetch()` with no AbortController or timeout. On a slow connection, this could hang indefinitely. The user sees no progress indication either -- only a toast on failure.

### CI-9 [Low] `!convo ? return null` on line 246 silently renders nothing
If `convoQuery` succeeds but returns `undefined`/`null`, the screen renders nothing with no error message. Should show an error state.

---

## conversation-media.tsx (547 lines)

### CM-1 [High] `as Record<string, unknown>` type assertion for thumbnailUrl (line 170)
`(msg as Record<string, unknown>).thumbnailUrl` -- this is an unsafe cast. If `Message` type doesn't have `thumbnailUrl`, the code silently extracts `undefined` via a Record cast. Should check if the field exists on the type or extend the type properly.

### CM-2 [Medium] Static `styles` object hardcodes `colors.dark.*` and `colors.text.*` (lines 447-547)
The `styles` StyleSheet at the bottom uses `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.border`, `colors.text.primary`, `colors.text.secondary`, `colors.text.tertiary` directly. These won't adapt to theme changes. The `ScaleMediaItem` subcomponent correctly uses `tc.*` via hooks, but the parent screen's static styles don't.

### CM-3 [Medium] No guard for missing `conversationId` param (line 114)
`conversationId` can be `undefined` (both `params.id` and `params.conversationId` could be missing). Line 138 does `messagesApi.getMessages(conversationId!, ...)` with a non-null assertion. If both params are missing, this will pass `undefined` to the API call. The `useInfiniteQuery` has no `enabled: !!conversationId` guard.

### CM-4 [Low] `toLocaleDateString()` without locale parameter (lines 269, 301)
Date formatting uses `new Date(item.createdAt).toLocaleDateString()` without passing the user's locale. This will use the device locale, which may not match the app's selected language (8 supported). Should use i18n-aware date formatting.

### CM-5 [Low] Link items open via `Linking.openURL` with no URL validation (line 218)
`handleOpenLink` passes raw extracted URLs to `Linking.openURL`. The `URL_REGEX` at line 96 is simple and could match malformed URLs. No sanitization or scheme validation (e.g., `javascript:` URLs from message content).

### CM-6 [Low] `ScaleMediaItem` creates new `useThemeColors` and `useContextualHaptic` per item (lines 67-68)
Each media item in the grid instantiates its own hook instances. While React handles this fine, it's unnecessary overhead for potentially hundreds of items. The parent could pass these as props.

### CM-7 [Info] BottomSheet for video player doesn't clean up VideoPlayer on close
When `videoPlayerVisible` becomes `false`, the `BottomSheet` closes but `selectedVideoUri` still holds the previous value. If `VideoPlayer` starts playback, there's no explicit `pause()` or cleanup when the sheet dismisses -- relies on component unmount.

### CM-8 [Info] Loading skeleton inside error path lacks header (lines 331-341)
The loading skeleton branch renders without a `GlassHeader`, so the user can't navigate back while loading. The error branch (line 343) also renders without navigation affordance beyond the retry button.

---

## pinned-messages.tsx (286 lines)

### PM-1 [Medium] Uses `Alert.alert` for unpin confirmation (line 61)
Project rules state: "showToast() -- for mutation feedback, NEVER bare Alert.alert for non-destructive." While unpin is somewhat destructive, the same screen uses `Alert.alert` which is acceptable for destructive confirmations, BUT the callback inside the Alert performs an async operation without catching thrown errors from `messagesApi.unpin` in all paths. The try/catch at line 71 does handle this correctly. This finding is informational.

### PM-2 [Medium] `item.sender` accessed without null guard (lines 95, 106)
`renderMessage` accesses `item.sender.displayName` directly. If the API returns a message where `sender` is null (e.g., system messages, deleted users), this crashes. No defensive check.

### PM-3 [Low] `messageInner` Pressable has no `onPress` handler (line 93-96)
The inner Pressable wrapping each pinned message has `accessibilityRole="button"` but no `onPress`. Tapping the message body does nothing. Should either navigate to the message in context or remove the button role.

### PM-4 [Low] Timestamp uses `toLocaleDateString()` without locale (line 109)
Same issue as CM-4. No locale parameter, won't match the app's i18n language.

### PM-5 [Low] Loading/error branches not wrapped in `ScreenErrorBoundary` (lines 135-167)
The loading and error returns (lines 135, 151) are outside the `ScreenErrorBoundary` wrapper that only covers the success path (line 170). If an error boundary crash happens during these states, it won't be caught.

### PM-6 [Info] `fonts` import at line 18 is used, but `Avatar` import at line 11 is unused
`Avatar` is imported but never used in the JSX. Dead import.

---

## chat-export.tsx (470 lines)

### CE-1 [Medium] Retry loop with exponential backoff can leak if component unmounts mid-sleep (lines 44-66)
The `loadStats` function has a while loop with `await new Promise(resolve => setTimeout(resolve, ...))`. The `cancelled` flag is checked at loop boundaries, but the `clearTimeout(timer)` on line 62 only runs if `cancelled` is already true when the timeout fires. If the component unmounts DURING the sleep, the timer is not properly cancelled -- the `resolve` function will still fire and the loop continues for one more iteration before checking `cancelled`.

### CE-2 [Low] `Share.share()` result is not checked (line 85)
`Share.share()` returns a result with `action` (shared/dismissed). The code ignores it. Not a bug, but the success haptic at line 90 fires even if the user dismissed the share sheet without actually sharing.

### CE-3 [Low] `handleExport` missing `haptic` in dependency array (line 97)
`useCallback` for `handleExport` uses `haptic.success()` and `haptic.error()` but `haptic` is not in the dependency array. The array is: `[conversationId, format, includeMedia, exporting, isOffline, t]`.

### CE-4 [Low] No `SafeAreaView` wrapper
The component uses a plain `View` with `backgroundColor: tc.bg` as its root. There's no `SafeAreaView`, so content can extend behind the notch/status bar. The `GlassHeader` may handle this internally, but the ScrollView content starts at `paddingTop: 100` (line 320) which is a magic number that may not match all device notch sizes.

### CE-5 [Info] `scrollContent` paddingTop is hardcoded `100` (line 320)
Magic number assumes a specific header height. If `GlassHeader` height changes or device has a larger status bar, content overlaps or has a gap.

### CE-6 [Info] ChatExportContent vs ChatExportScreen naming
`ChatExportContent` is the actual implementation (line 23), wrapped by `ChatExportScreen` (line 304). The `export default` is on `ChatExportScreen`. This pattern is fine but the inner component name could be clearer.

---

## chat-folders.tsx (377 lines)

### CF-1 [High] `Record<string, unknown>` used everywhere instead of typed interface (lines 74, 78-80, 83, 97-98, etc.)
The entire screen uses `Record<string, unknown>` for folder objects and conversations. This is effectively `any` with extra steps. Field accesses like `item.name as string`, `item.id as string`, `item.conversationIds as string[]`, `item.icon as string` are all unsafe casts that will silently produce `undefined` if the API shape changes. This violates the project's strict typing rule.

### CF-2 [Medium] `PredefinedFilter.filter` function accepts `Record<string, unknown>` (line 31)
The filter functions cast fields like `(c.unreadCount as number)` and compare `c.isGroup === true`. These are completely untyped -- any typo in field names passes the compiler silently.

### CF-3 [Medium] No error state for initial folder load (lines 270-294)
When `foldersQuery` fails (`isError`), the `ListEmptyComponent` only shows loading skeletons (when `isLoading`) or the empty state. There's no error handling branch. A failed API call shows the "No folders yet" empty state, misleading the user.

### CF-4 [Medium] `width: '48%' as unknown as number` unsafe cast (line 373)
`predefinedCard` style uses `'48%' as unknown as number` to bypass TypeScript's type check on width. This is a double-cast through `unknown` -- exactly the pattern the project rules prohibit.

### CF-5 [Low] Delete mutation closes the menu sheet before the Alert shows (line 321)
`setMenuFolder(null)` is called before `Alert.alert()`. This means the BottomSheet dismiss animation plays simultaneously with the Alert appearing, which can cause a visual glitch on iOS where both animations compete.

### CF-6 [Low] No `accessibilityLabel` on the GlassHeader back button (line 166)
`leftAction` only passes `{ icon: 'arrow-left', onPress: () => router.back() }` without an `accessibilityLabel`. The right action also lacks one.

### CF-7 [Low] `editingFolder` state not reflected in create title correctly (line 212)
The create form shows `t('risalah.editFolder')` when `editingFolder` is truthy, but `editingFolder` is only set when the user clicks "Edit" from the context menu. If the user opens create mode directly (via the + button), `editingFolder` could still be non-null from a previous edit session that was cancelled via a different path.

### CF-8 [Info] `useRef` imported but not used (line 2)
`useRef` is in the imports at line 2 but never used in the component.

---

## chat-lock.tsx (398 lines)

### CL-1 [Medium] `loadState` effect depends on `isLocked` and `isBiometricAvailable` function references (line 44)
The `useEffect` at line 29 has `[conversationId, isLocked, isBiometricAvailable]` in its dependency array. If `useChatLock` returns new function references on every render (common if the hook doesn't memoize), this effect re-runs every render, causing redundant async calls and potential state flickering.

### CL-2 [Low] `handleToggle` includes `locked` in dependency array but uses stale value (line 71)
The `useCallback` for `handleToggle` captures `locked` from state. If `handleToggle` is called rapidly (despite the `toggling` guard), the `locked` value could be stale from a previous render. The `toggling` guard at line 47 mitigates this, but the logic should ideally use a functional state updater.

### CL-3 [Low] `handleRemoveLock` duplicates `handleToggle` unlock logic (lines 73-103 vs 46-71)
Both `handleRemoveLock` and the `else` branch of `handleToggle` (when `locked === true`) call `unlockConversation` with identical error handling. Code duplication that could drift.

### CL-4 [Low] No loading skeleton while `loading === true` (line 105+)
The component renders the full UI immediately. While `loading` is `true`, the Switch is disabled but the rest of the UI (lock icon, explanation text) renders as if biometrics are unavailable. Should show a skeleton or loading indicator.

### CL-5 [Low] `scrollContent` paddingTop is hardcoded `100` (line 288)
Same magic number issue as CE-5. Assumes fixed GlassHeader height.

### CL-6 [Info] `useEffect` in line 29 has no error handling for Promise.all rejection
If `isBiometricAvailable()` throws (e.g., native module not linked), `Promise.all` rejects. The `finally` block sets `loading = false`, but no error state is shown to the user. The biometric check silently fails and the user sees "Biometric authentication is not available" even if the real error was a crash.

---

## chat-theme-picker.tsx (855 lines)

### CT-1 [High] TABS array uses hardcoded English strings (lines 38-43)
```typescript
const TABS: { id: TabType; label: string }[] = [
  { id: 'solid', label: 'Solid Colors' },
  { id: 'gradients', label: 'Gradients' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'photos', label: 'Photos' },
];
```
These are hardcoded English strings. The `label` property is never used in the JSX (the JSX uses `t('chatThemePicker.tab.${tab.id}')` instead), but this is still dead code with hardcoded strings violating i18n rules.

### CT-2 [High] Theme name arrays use hardcoded English strings (lines 45-86)
`SOLID_COLORS`, `GRADIENTS`, `PATTERNS`, and `PHOTOS` all have hardcoded English `name` fields like `'Midnight Blue'`, `'Deep Purple'`, `'Islamic Art'`, etc. These `name` fields are never used directly in JSX (the JSX uses `t('chatThemePicker.themeName.${item.id}')` instead), but they're still dead i18n-violating code.

### CT-3 [Medium] `ImagePicker.MediaTypeOptions.Images` is deprecated (line 260)
Expo SDK 52 deprecated `MediaTypeOptions` in favor of the new `mediaTypes: ['images']` array syntax. Line 260 uses the deprecated enum. Should use `mediaTypes: ['images']` like conversation-info.tsx does (line 153).

### CT-4 [Medium] `AsyncStorage.getItem` in `useEffect` has no error handling (lines 106-120)
The `.then()` callback at line 107 only handles the success case and catches JSON parse errors. But `AsyncStorage.getItem` itself can throw (e.g., corrupted storage, native bridge failure). There's no `.catch()` on the Promise chain.

### CT-5 [Medium] No `conversationId` guard shows full UI with broken save
If `conversationId` is undefined (param missing), the screen renders normally but the "Apply" button saves nothing (the `if (conversationId)` check at line 539 silently skips). The user thinks they applied a theme but nothing persisted. Should show an error state like chat-export does.

### CT-6 [Low] `getCurrentTheme` is not memoized (line 145)
Called on every render at line 310 (`const currentTheme = getCurrentTheme()`). Performs array `.find()` twice. Should be a `useMemo`.

### CT-7 [Low] `opacity` and `blur` state not bounded on direct set
While the slider buttons use `Math.max/Math.min`, nothing prevents external code from setting invalid values. Minor since there's no other write path.

### CT-8 [Low] `applyingRef` prevents double-tap but doesn't prevent navigation race (lines 508-524, 533-551)
Both reset and apply handlers call `router.back()` at the end. If AsyncStorage write is slow, the user might tap back manually while `applyingRef` is still true, causing the state to be partially applied.

### CT-9 [Info] `useWindowDimensions` re-renders on every resize
The `width` from `useWindowDimensions()` is used for grid item sizing. On orientation change or split-screen resize, the entire component re-renders including all grid items. Could use a debounced value.

---

## starred-messages.tsx (370 lines)

### SM-1 [High] Unsafe type assertions throughout (lines 50, 53, 135)
Line 50: `const allStarred: Message[] = ((data as { data?: Message[] })?.data ?? data ?? []) as Message[];`
This is a triple-nested cast through two different shapes. If the API returns neither shape, the cast silently produces garbage.

Line 53: `(msg as unknown as Record<string, unknown>).conversationId` -- double cast through `unknown` to access a field that may or may not exist on `Message`.

Line 135: `(reaction as unknown as { count?: number }).count` -- same pattern.

These violate the strict typing rules.

### SM-2 [Medium] `handleUnstar` requires `conversationId` but it's optional (lines 63-79)
The function checks `if (!conversationId)` and shows a generic error toast (line 68). But the screen is designed to work both with and without a `conversationId` (all starred messages vs. per-conversation). When viewing all starred messages, the unstar button appears but can never work because `conversationId` is undefined. The button should be hidden or the conversationId should come from the message itself.

### SM-3 [Medium] Fetches ALL starred messages then filters client-side (lines 41-54)
`getStarredMessages()` fetches every starred message, then line 52-54 filters by `conversationId` client-side. At scale (hundreds of starred messages), this downloads unnecessary data. The API should accept a `conversationId` filter parameter.

### SM-4 [Low] `isUnstarringRef.current` guard is global, not per-message (line 63)
The `isUnstarringRef` prevents concurrent unstar operations globally. If the user tries to unstar message A while message B is being unstarred, message A's unstar is silently dropped with no feedback.

### SM-5 [Low] `renderMessage` Pressable has `accessibilityRole="none"` (line 91)
The inner Pressable wrapping each message declares `accessibilityRole="none"`, making it invisible to screen readers. The unstar button inside (via reactions) is the only interactive element, but the parent intercepting touches while being invisible to accessibility is problematic.

### SM-6 [Low] Loading/error branches not wrapped in `ScreenErrorBoundary` (lines 145-185)
Same issue as PM-5. The `ScreenErrorBoundary` only wraps the success path at line 188.

### SM-7 [Info] `isRTL` destructured from `useTranslation` but never used (line 27)
`const { t, isRTL } = useTranslation();` -- `isRTL` is unused in this file.

### SM-8 [Info] `queryClient` imported but only used for invalidation
Minor, but `useQueryClient()` is instantiated even when not needed for the read-only view (without conversationId). Not a bug.

---

## Summary Table

| Screen | Critical | High | Medium | Low | Info | Total |
|--------|----------|------|--------|-----|------|-------|
| new-conversation.tsx | 0 | 0 | 2 | 3 | 2 | 7 |
| conversation-info.tsx | 0 | 1 | 4 | 4 | 1 | 10 |
| conversation-media.tsx | 0 | 1 | 2 | 3 | 2 | 8 |
| pinned-messages.tsx | 0 | 0 | 2 | 3 | 1 | 6 |
| chat-export.tsx | 0 | 0 | 1 | 3 | 2 | 6 |
| chat-folders.tsx | 0 | 1 | 3 | 3 | 1 | 8 |
| chat-lock.tsx | 0 | 0 | 1 | 4 | 1 | 6 |
| chat-theme-picker.tsx | 0 | 2 | 3 | 3 | 1 | 9 |
| starred-messages.tsx | 0 | 1 | 3 | 3 | 2 | 9 |
| **TOTAL** | **0** | **6** | **21** | **29** | **13** | **69** |

### Top Issues by Category

**Type Safety (13 findings):** Pervasive `as any`-equivalent patterns (`as User`, `as Record<string, unknown>`, `as unknown as ...`). chat-folders.tsx is the worst offender with untyped everything. starred-messages.tsx has triple-nested casts.

**Hardcoded Colors (2 screens):** conversation-info.tsx and conversation-media.tsx have static `StyleSheet.create()` blocks using `colors.dark.*` directly instead of theme-aware `tc.*` values.

**Missing Accessibility (6 findings):** Wrong labels on conversation-info action rows, missing labels on back buttons, `accessibilityRole="none"` on interactive elements.

**Stale Dependencies (4 findings):** Multiple `useCallback` hooks missing dependencies for `styles`, `haptic`, or referencing non-memoized functions.

**No Error States (3 findings):** Missing conversationId silently renders empty/broken UI instead of an error screen on conversation-media, chat-theme-picker.

**Dead Code (3 findings):** Unused imports (Avatar in pinned-messages, useRef in chat-folders, isRTL in starred-messages), dead style definitions.
