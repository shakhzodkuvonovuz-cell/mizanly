# M03 — Hostile Code Audit: Profile & Social Screens

**Scope:** 10 files in `apps/mobile/app/(screens)/`
- `edit-profile.tsx` (~865 lines)
- `profile-customization.tsx` (~731 lines)
- `flipside.tsx` (~630 lines)
- `analytics.tsx` (~654 lines)
- `share-profile.tsx` (~426 lines)
- `follow-requests.tsx` (~253 lines)
- `mutual-followers.tsx` (~336 lines)
- `streaks.tsx` (~518 lines)
- `invite-friends.tsx` (~120 lines)
- `achievements.tsx` (~473 lines)

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 11 |
| Medium | 18 |
| Low | 13 |
| Info | 7 |
| **Total** | **52** |

---

## Critical

### C1 — follow-requests.tsx: `t()` used before declaration (temporal dead zone hazard)
**File:** `follow-requests.tsx` **Lines:** 116, 129 vs 139
**Detail:** `acceptMutation` and `declineMutation` are defined at lines 112-136, and their `onSuccess` callbacks reference `t()`. However, `const { t, isRTL } = useTranslation()` is not declared until line 139. Because `const` is in the temporal dead zone until its declaration, if React ever synchronously invokes the callback during the same tick as initialization (e.g., from a cached mutation), this would throw a `ReferenceError`. Even though callbacks typically fire asynchronously, this is fragile code ordering. The hook calls `useThemeColors()` and `useTranslation()` should be at the top of the function, before any `useMutation` calls that reference their return values.

### C2 — edit-profile.tsx: `saveMutation.mutate()` sets `uploading` state but error path can orphan it
**File:** `edit-profile.tsx` **Lines:** 148-178
**Detail:** The `mutationFn` sets `setUploading(true)` at line 149 and `setUploading(false)` at line 155 after both uploads. But if `uploadImage(avatarUri, 'avatars')` throws, the code jumps to `onError` (line 174) which correctly calls `setUploading(false)`. However, if the `usersApi.updateMe()` call at line 166 rejects, `uploading` has already been set to `false` at line 155, so the button still shows "saving" via `saveMutation.isPending`. The real issue is that `uploading` state is redundant with `isPending` and creates split-brain loading states. If the fetch for the blob (line 139) throws synchronously or the resize throws, `setUploading(false)` is never reached in the happy path before `onError`.

### C3 — edit-profile.tsx: No URL validation on profile links
**File:** `edit-profile.tsx` **Lines:** 83-91, 570-608
**Detail:** When adding a profile link, the only validation is `!newLinkTitle.trim() || !newLinkUrl.trim()` (line 605/608). There is zero URL format validation. A user can submit `javascript:alert(1)`, `data:text/html,...`, or any arbitrary string as a "URL". This is an XSS vector if these links are ever rendered as clickable `<a href>` in a web view or on another platform. The `profile-customization.tsx` file has an `isValidUrl()` function (line 81-89) that validates URLs properly -- but `edit-profile.tsx` does not use it.

---

## High

### H1 — edit-profile.tsx: Stylesheet uses hardcoded `colors.dark.*` and `colors.text.*` instead of theme tokens
**File:** `edit-profile.tsx` **Lines:** 646, 680, 681, 693, 750, 751, 753, 764, 773, 792, 820, 821, 835, 846, 857, 863
**Detail:** 16 occurrences of `colors.dark.bg`, `colors.dark.border`, `colors.dark.surface`, `colors.text.primary`, `colors.text.secondary`, `colors.text.tertiary` in the static `StyleSheet.create()`. These are dark-mode-only hardcoded colors. Unlike `profile-customization.tsx` and `streaks.tsx` which use `createStyles(tc)` with dynamic theme colors, `edit-profile.tsx` uses a static stylesheet. This means the screen will look wrong in any light theme or high-contrast accessibility mode.

### H2 — achievements.tsx: Stylesheet uses hardcoded `colors.text.*` instead of theme tokens
**File:** `achievements.tsx` **Lines:** 48, 372, 388, 411, 439, 444, 459
**Detail:** 7 occurrences of `colors.text.secondary`, `colors.text.primary`, `colors.text.tertiary` in the static stylesheet. Same issue as H1: dark-mode-only colors that break theme-awareness. The `RARITY_COLORS` map at line 48 uses `colors.text.secondary` which is a hardcoded dark-mode value, but this color is also used in JSX (line 81) and will be wrong in light mode.

### H3 — achievements.tsx: No error state handling
**File:** `achievements.tsx` **Lines:** 193-334
**Detail:** The `useQuery` at line 193 destructures `{ data, isLoading, refetch, isRefetching }` but never destructures or checks `isError` or `error`. If the API call fails, the screen silently shows the empty state ("Start using the app") rather than an error state with retry. Every other screen in scope handles `isError` with an `EmptyState` error UI. This one does not.

### H4 — invite-friends.tsx: No loading or error UI
**File:** `invite-friends.tsx` **Lines:** 27-31, 60-101
**Detail:** The query at line 27 destructures `{ isLoading, isError, refetch }` but none of these are used to conditionally render loading skeletons or error states. When `isLoading` is true, the screen shows the full hero section and share button -- the share button will do nothing (line 38 returns early) but there's no visual indication of loading. When `isError` is true, the screen shows `shareUrl` as `'https://mizanly.app'` and an empty referral code -- no error feedback at all.

### H5 — flipside.tsx: Static stylesheet ignores theme tokens
**File:** `flipside.tsx` **Lines:** 530-630
**Detail:** The `flipside.tsx` stylesheet at line 530 is static `StyleSheet.create({...})` without `createStyles(tc)`. Colors like `borderColor: colors.active.white6` (lines 541, 562, 620), `borderTopColor: 'rgba(255,255,255,0.06)'` (line 609), `backgroundColor: 'rgba(248,81,73,0.1)'` (line 591) are all dark-mode-only. The JSX does use `tc.text.*` and `tc.bg` dynamically in some places, but the stylesheet border/background colors won't adapt.

### H6 — analytics.tsx: Static stylesheet ignores theme tokens
**File:** `analytics.tsx` **Lines:** 453-654
**Detail:** The stylesheet uses `borderColor: colors.active.white6` (lines 478, 547, 609), `borderColor: 'rgba(255,255,255,0.08)'` (line 479), `backgroundColor: colors.active.emerald10` (line 599). These are dark-mode hardcoded values. The screen uses `tc` in JSX for text colors but relies on the static stylesheet for borders and backgrounds.

### H7 — edit-profile.tsx: `fontWeight` used instead of `fontFamily: fonts.*`
**File:** `edit-profile.tsx` **Lines:** 670, 680, 750, 801, 820, 835, 864
**Detail:** 7 instances of `fontWeight: '500'`, `'600'`, `'700'` in the stylesheet. The project standard (per `.claude/rules/mobile-screens.md`) is to use `fontFamily: fonts.bodyMedium` / `fonts.bodySemiBold` / `fonts.bodyBold`. Numeric `fontWeight` can produce inconsistent rendering across platforms (Android especially) when custom fonts are loaded, because the system fallback font may not have that weight.

### H8 — share-profile.tsx: setTimeout leak on unmount
**File:** `share-profile.tsx` **Line:** 46
**Detail:** `setTimeout(() => setCopied(false), 2000)` at line 46 is never cleaned up. If the user copies the link and navigates away within 2 seconds, `setCopied(false)` will fire on an unmounted component, producing a React "can't update a component that's already unmounted" warning. Per project rules, every feature needs cleanup on unmount.

### H9 — profile-customization.tsx: `isDirtyRef` never gates save -- stale save possible
**File:** `profile-customization.tsx` **Lines:** 185, 256-269
**Detail:** `isDirtyRef.current` is set to `true` on individual field changes but set to `false` at line 258 before `saveMutation.mutate()`. If the mutation fails (e.g., network error), `isDirtyRef.current` is already `false`, so the unsaved-changes dialog (line 241) will NOT warn the user about their unsaved changes. The ref should only be reset to `false` in `onSuccess`.

### H10 — analytics.tsx: `BarChart` date parsing with `new Date(date)` can produce wrong dates
**File:** `analytics.tsx` **Lines:** 79, 126-127
**Detail:** The date string from `stat.date.split('T')[0]` produces `"2026-04-05"`. When passed to `new Date("2026-04-05")`, JavaScript treats this as UTC midnight, which in certain timezones (UTC-) displays as the previous day. Lines 126-127 use `new Date(date).toLocaleDateString()` which could show April 4 instead of April 5 for users in UTC- timezones. Should use `new Date(date + 'T12:00:00')` to avoid timezone-boundary issues.

### H11 — flipside.tsx: No input validation on alt profile `displayName`
**File:** `flipside.tsx` **Lines:** 141-145
**Detail:** `handleCreate` only checks `displayName.trim()` is truthy. There is no minimum length check, no character filtering, no profanity/injection check. A single space followed by a character (e.g., " a") would pass. The `bio` field has a `maxLength={500}` on the `TextInput` at line 276 but `displayName` has `maxLength={50}` (line 262) -- however these are client-side only and offer no protection against API manipulation.

---

## Medium

### M1 — edit-profile.tsx: No cleanup on useEffect that seeds form state
**File:** `edit-profile.tsx` **Lines:** 101-110
**Detail:** The `useEffect` at line 101 watches `[me]` and seeds all form fields. If the user is mid-edit and a background refetch completes (e.g., from the `BrandedRefreshControl` at line 272-276), all their edits will be overwritten silently. There is no guard checking `isDirty` before re-seeding.

### M2 — profile-customization.tsx: Same refetch-overwrites-edits issue
**File:** `profile-customization.tsx` **Lines:** 187-198
**Detail:** The `useEffect` at line 187 watches `[data]` and re-seeds all form state. If the user pulls to refresh while editing (the `BrandedRefreshControl` at line 297 triggers `refetch()`), their unsaved changes are silently overwritten when the refetch completes.

### M3 — flipside.tsx: `handleRefresh` calls three refetches without awaiting
**File:** `flipside.tsx` **Lines:** 173-177
**Detail:** `handleRefresh` calls `profileQuery.refetch()`, `accessListQuery.refetch()`, and `postsQuery.refetch()` without awaiting any of them. The `BrandedRefreshControl` at line 472 checks `profileQuery.isRefetching || postsQuery.isRefetching` for the spinner, but `handleRefresh` is not async and returns synchronously. This means the refresh spinner may stop before all three refetches complete.

### M4 — mutual-followers.tsx: `isToggling` disables ALL follow buttons, not just the one being toggled
**File:** `mutual-followers.tsx` **Lines:** 246, 55-66
**Detail:** The `isToggling` prop at line 246 is `followMutation.isPending || unfollowMutation.isPending` -- a single boolean. When any one follow/unfollow is in progress, ALL `GradientButton`s in the list are disabled. This prevents the user from quickly following/unfollowing multiple people. Should track per-user pending state via `mutation.variables`.

### M5 — analytics.tsx: `BarChart` renders all bars regardless of count
**File:** `analytics.tsx` **Lines:** 70-133
**Detail:** If the API returns 365 days of stats, the bar chart will render 365 bars each 6px wide (style line 561), overflowing the container with no horizontal scrolling. There is no limit on the number of days rendered and no `ScrollView` wrapper for the chart. The `FollowerGrowthChart` correctly filters to 7 or 30 days (lines 187-194), but `BarChart` does not.

### M6 — analytics.tsx: `FollowerGrowthChart` query has no error state
**File:** `analytics.tsx` **Lines:** 179-182
**Detail:** The `useQuery` at line 179 only destructures `{ data: growthData, isLoading: growthLoading }`. If `creatorApi.getGrowth()` fails, there is no error handling -- the chart silently shows "No growth data yet" (the empty state), misleading the user into thinking they have no followers rather than that the fetch failed.

### M7 — edit-profile.tsx: `pickAvatar` and `pickCover` don't request permissions first
**File:** `edit-profile.tsx` **Lines:** 113-133
**Detail:** `ImagePicker.launchImageLibraryAsync()` is called directly without first calling `ImagePicker.requestMediaLibraryPermissionsAsync()`. On iOS 14+ with limited photo access, and on Android 13+ with granular media permissions, this will show the system permission dialog. If denied, the function returns a cancelled result -- but there's no feedback to the user about WHY nothing happened. Should request permission first and show a toast if denied.

### M8 — profile-customization.tsx: `handlePickBackgroundImage` same missing permission check
**File:** `profile-customization.tsx` **Lines:** 213-237
**Detail:** Same as M7. `ImagePicker.launchImageLibraryAsync()` called without explicit permission request. No feedback on denial.

### M9 — edit-profile.tsx: `saveMutation` sends empty strings for optional fields
**File:** `edit-profile.tsx` **Lines:** 157-165
**Detail:** The payload sends `bio: bio.trim()` which can be `""` (empty string). If the backend expects `undefined` to mean "don't change this field" vs `""` to mean "clear this field", sending `""` will clear the bio even if the user didn't intend to. The `website` and `location` fields have the same issue. Should send `undefined` for unchanged/empty fields.

### M10 — share-profile.tsx: QR code rendered with empty string when user has no username
**File:** `share-profile.tsx` **Lines:** 38, 157-158
**Detail:** `profileUrl` is `''` when `user?.username` is falsy (line 38). The `QRCode` component at line 158 is given `value={profileUrl}` which is `''`. Most QR code libraries will either render a broken QR code or throw an error for an empty value string. There's a `!user` check earlier (line 119), but `user` could exist with `username: null/undefined`.

### M11 — edit-profile.tsx: No `displayName` empty-string validation before save
**File:** `edit-profile.tsx` **Lines:** 147-166
**Detail:** The save mutation sends `displayName: displayName.trim()` which can be `""`. There is no UI-side check preventing the user from clearing their display name entirely. If the backend rejects empty display names, the error toast shows -- but a preemptive client-side check (disable save button when displayName is empty) would be better UX.

### M12 — analytics.tsx: `formatCompactNumber(values[i])` inside an accessibility label uses i18n fallback
**File:** `analytics.tsx` **Line:** 109
**Detail:** The accessibility label template includes `${t('analytics.views', 'views')}` but this is the same key used at line 414 for the card title. The i18n value might be "Views" (capitalized noun form) rather than "views" (lowercase for inline text). The accessibility label reads awkwardly as "Apr 5: 12K Views" instead of a proper sentence. Minor but shows incomplete accessibility polish.

### M13 — flipside.tsx: `formatDistanceToNowStrict` called with potentially invalid date
**File:** `flipside.tsx` **Lines:** 311, 341
**Detail:** `new Date(item.createdAt)` and `new Date(altProfile.createdAt)` -- if the server returns an unexpected format (e.g., Unix timestamp as number, null, or empty string), `new Date()` will produce `Invalid Date`, and `formatDistanceToNowStrict` will throw. No try/catch around the date formatting.

### M14 — achievements.tsx: FlatList `numColumns={2}` without `getItemLayout` means costly re-renders
**File:** `achievements.tsx` **Lines:** 311-334
**Detail:** The FlatList with `numColumns={2}` at line 315 doesn't provide `getItemLayout`. When filtering by category (lines 203-206), the entire list re-renders because React Native can't optimize scroll position without item dimensions. For a grid of cards with `minHeight: 200` (line 406), this could cause janky transitions when switching categories.

### M15 — invite-friends.tsx: Unsafe type casts for referral data
**File:** `invite-friends.tsx` **Lines:** 34-35
**Detail:** `(referralData as Record<string, unknown>)?.shareUrl as string ?? 'https://mizanly.app'` and same for `referralCode`. This double cast from unknown through `Record<string, unknown>` to `string` is fragile. If `usersApi.getReferralCode()` returns a shape where `shareUrl` is a number or nested object, the cast silently produces wrong data. Should define a proper response type interface.

### M16 — analytics.tsx: `SummaryCard` accepts `change` as optional string but only checks prefix
**File:** `analytics.tsx` **Lines:** 29, 48-63
**Detail:** The `change` prop on `SummaryCard` is `string | undefined` and is checked with `change?.startsWith('+')` and `change?.startsWith('-')`. But no `SummaryCard` usage in the code actually passes a `change` prop (lines 413-430). The change indicator code is dead code that's never exercised and untestable.

### M17 — edit-profile.tsx: image upload doesn't provide width/height to `resizeForUpload`
**File:** `edit-profile.tsx` **Line:** 137
**Detail:** `resizeForUpload(uri)` is called with only the URI, unlike `profile-customization.tsx` line 225 which calls `resizeForUpload(uri, result.assets[0].width, result.assets[0].height)`. If `resizeForUpload` needs dimensions to calculate the resize target, omitting them may result in suboptimal resizing or a fallback path.

### M18 — follow-requests.tsx: `listEmpty` memoized with `[t]` but `t` function identity changes on language switch
**File:** `follow-requests.tsx` **Lines:** 143-149
**Detail:** `useMemo(() => ..., [t])` -- the `t` function from `useTranslation()` changes identity on every render in many i18n implementations. If it does, this `useMemo` provides zero benefit and re-creates on every render. Should memoize with a more stable dep (e.g., the current language string).

---

## Low

### L1 — edit-profile.tsx: `ScreenErrorBoundary` only wraps the main render, not loading/error states
**File:** `edit-profile.tsx` **Lines:** 208-240, 248
**Detail:** The loading state (line 208-219) and error state (line 222-239) are returned without `ScreenErrorBoundary` wrapping. Only the main form (line 248) is wrapped. If a crash occurs during loading render (e.g., `Skeleton.ProfileHeader` throws), there is no boundary.

### L2 — flipside.tsx: `ScreenErrorBoundary` inconsistently applied
**File:** `flipside.tsx` **Lines:** 182-214
**Detail:** The loading state (line 182-194) and error state (line 196-215) are returned without `ScreenErrorBoundary`. The create-form state (line 220) and main profile state (line 434) ARE wrapped. If the loading skeleton or error EmptyState throws, no boundary catches it.

### L3 — mutual-followers.tsx: Loading/error states not wrapped in `ScreenErrorBoundary`
**File:** `mutual-followers.tsx` **Lines:** 186-268, 271
**Detail:** Error state (line 186-208) and loading state (line 252-268) are returned outside of `ScreenErrorBoundary`. Only the main list (line 271) is wrapped.

### L4 — analytics.tsx: `onRefresh` uses manual `setRefreshing` instead of query's built-in `isRefetching`
**File:** `analytics.tsx` **Lines:** 322, 332-336
**Detail:** The `refreshing` state (line 322) and `setRefreshing(true/false)` (lines 333-335) duplicate what `useQuery`'s `isRefetching` provides. Other screens in scope (streaks.tsx line 293, achievements.tsx line 322) use `isRefetching` directly. Manual state creates a risk of mismatched states (e.g., if `refetch()` rejects before `setRefreshing(false)` runs, the spinner never stops -- though `finally` would fix this).

### L5 — share-profile.tsx: Loading/error states not wrapped in `ScreenErrorBoundary`
**File:** `share-profile.tsx` **Lines:** 70-136
**Detail:** Loading (line 70-99), error (line 101-117), and no-user (line 119-136) states are all rendered outside of `ScreenErrorBoundary`. Only the main content (line 139) is wrapped. If `QRCode` import fails or `Skeleton` throws during loading, no boundary catches it.

### L6 — achievements.tsx: `FlatList` inside `SafeAreaView` with no explicit `edges` on the content
**File:** `achievements.tsx` **Lines:** 289, 311-334
**Detail:** `SafeAreaView edges={['top']}` at line 289 doesn't include `'bottom'`. The `FlatList` at line 311 has `paddingBottom: spacing['2xl']` (line 358) which may not be enough on iPhone models with home indicator. Other screens (e.g., `streaks.tsx` line 289) explicitly include `insets.bottom` in the bottom padding.

### L7 — invite-friends.tsx: Hardcoded border radius 40
**File:** `invite-friends.tsx` **Line:** 112
**Detail:** `iconCircle: { borderRadius: 40 }` -- per project rules, border radius >= 6 should use `radius.*` tokens. Should be `borderRadius: radius.full` (which is 9999 and would round a circle of any size).

### L8 — streaks.tsx: Hardcoded border radius 3
**File:** `streaks.tsx` **Line:** 464
**Detail:** `legendCell: { borderRadius: 3 }` -- should use `radius.xs` or similar theme token instead of a hardcoded value. Per project rules, borderRadius >= 6 should use tokens, but even values < 6 should use tokens for consistency.

### L9 — analytics.tsx: `fontWeight: '700'` instead of `fontFamily: fonts.bodyBold`
**File:** `analytics.tsx` **Line:** 579
**Detail:** `barTooltipText: { fontWeight: '700' }` -- should use `fontFamily: fonts.bodyBold` per project standards.

### L10 — flipside.tsx: Delete button uses `Alert.alert` instead of `BottomSheet` for destructive action
**File:** `flipside.tsx` **Lines:** 153-163
**Detail:** Per project rules, `BottomSheet` should be used instead of `Alert.alert` for non-destructive feedback. For destructive actions like delete, `Alert.alert` is arguably acceptable, but the project's own rule says "NEVER bare `Alert.alert` for non-destructive" -- the delete confirmation IS destructive so this is borderline acceptable. However, `profile-customization.tsx` line 243 also uses `Alert.alert` for unsaved changes (non-destructive), which violates the rule.

### L11 — profile-customization.tsx: `Alert.alert` used for unsaved changes dialog
**File:** `profile-customization.tsx` **Lines:** 242-250
**Detail:** `Alert.alert` for the unsaved changes prompt. Per mobile rules: "showToast() for mutation feedback, NEVER bare `Alert.alert` for non-destructive." The unsaved changes dialog is not a mutation feedback, but it's a confirmation dialog that could use BottomSheet for consistency.

### L12 — edit-profile.tsx: `Alert.alert` used for unsaved changes dialog
**File:** `edit-profile.tsx` **Lines:** 195-202
**Detail:** Same issue as L11. `Alert.alert` for unsaved changes prompt.

### L13 — analytics.tsx: `barTooltip` only shown via `onLongPress`, no `onPress` feedback
**File:** `analytics.tsx` **Lines:** 107-113
**Detail:** The bar tooltip (showing the exact value) is only triggered by `onLongPress`. There's no visual feedback on regular press, and no accessibility hint that long-pressing reveals data. Users on Android without force-touch may not discover this interaction.

---

## Info

### I1 — No offline/optimistic handling across any screen
**Detail:** None of the 10 screens implement optimistic updates or offline queuing. All mutations fail silently with a toast when offline. `follow-requests.tsx` accept/decline, `mutual-followers.tsx` follow/unfollow, and `flipside.tsx` create/update/delete all hit the network with no offline strategy. For a social app, these are high-frequency actions that benefit from optimistic UI.

### I2 — No AbortController cleanup on any query or mutation
**Detail:** None of the 10 screens pass an `AbortController` signal to their queries. If the user navigates away while a query is in-flight, it completes in the background and updates the cache for a screen that's no longer mounted. React Query handles this gracefully (the component is unmounted so setState is a no-op in newer React), but it wastes bandwidth and battery.

### I3 — `achievements.tsx` and `analytics.tsx` have dead/unused styles
**File:** `achievements.tsx` **Line:** 410 -- `lockedText` style is defined but never referenced in JSX
**File:** `analytics.tsx` -- `HEADER_OFFSET` (line 318) is used for `scrollContent.paddingTop` and the error state offset, but the constant name is misleading as it's not related to the header height.

### I4 — `analytics.tsx`: Two separate analytics data sources noted but unresolved
**File:** `analytics.tsx` **Lines:** 314-317
**Detail:** The TODO comment at line 314 acknowledges that `usersApi.getAnalytics()` and `creatorApi.getGrowth()` are two separate data sources that may show inconsistent numbers. This is noted but no code action taken. Not a bug, but a data integrity concern.

### I5 — `flipside.tsx`: `postsQuery` uses `useInfiniteQuery` with weak typing
**File:** `flipside.tsx` **Lines:** 83-89
**Detail:** `altProfileApi.getOwnPosts(pageParam as string | undefined)` -- the `as string | undefined` cast on `pageParam` suggests the API return type doesn't properly type the cursor. The `getNextPageParam` at line 87 does `last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined` with optional chaining, suggesting `meta` might be missing from the response type.

### I6 — All 10 screens import `useRouter` from `expo-router` but none pre-populate the back stack
**Detail:** All screens use `router.back()` for navigation, but none handle the case where the back stack is empty (e.g., deep link directly to the screen). If there's nothing to go back to, `router.back()` is a no-op, and the user is stuck. Should fall back to `router.replace('/(tabs)/profile')` or similar.

### I7 — `streaks.tsx`: Empty state for zero streaks shows retry button
**File:** `streaks.tsx` **Lines:** 309-315
**Detail:** When `streaks.length === 0`, the EmptyState shows `actionLabel={t('common.retry')}` with `onAction={() => refetch()}`. Retrying won't create streaks -- the user needs to actually use the app. The action label should be something like "Start posting" or the retry button should be omitted.

---

## Files Not Audited / Out of Scope
- API endpoints backing these screens (validation happens server-side too)
- The i18n JSON files (keys assumed to exist; not verified)
- The `@/services/api` and `@/services/altProfileApi` implementations
- Component internals (`Avatar`, `GlassHeader`, `GradientButton`, etc.)
