# M11 — Settings & Safety Screens Hostile Audit

**Date:** 2026-04-05
**Auditor:** Opus 4.6 (hostile mode)
**Scope:** 10 screens — settings, theme-settings, notification-tones, content-settings, blocked, muted, report, safety-center, parental-controls, screen-time
**Checklist:** Error handling, Loading states, Cleanup, i18n, Type safety, Offline handling, Input validation, Theme tokens

---

## 1. settings.tsx (~1505 lines)

### S1-01 | Critical | No ScreenErrorBoundary on loading state
**Lines 291-304.** The loading skeleton branch returns a bare `<View>` with no `<ScreenErrorBoundary>` wrapper. If the Skeleton components throw during render, the crash is unhandled. The main content branch (line 308) correctly wraps with `<ScreenErrorBoundary>`.

### S1-02 | Medium | No error state — settingsQuery.isError never handled
**Lines 291-1376.** The screen checks `settingsQuery.isLoading` (line 291) but never checks `settingsQuery.isError`. If the settings API fails, the screen proceeds with default state values (all false/true), silently showing wrong toggle positions. User thinks they've disabled notifications when the server state is the opposite.

### S1-03 | Medium | No offline guard on mutation calls
**Lines 475, 543, 549, 555, 560, 575, 611.** All toggle mutations (`privacyMutation`, `notifMutation`, `wellbeingMutation`, `accessibilityMutation`) fire without checking `useIsOffline()`. The hook is not even imported. When offline, mutation fires, fails silently (only toast on error), and local state is already toggled — user sees toggled UI but server never received it. Contrast with `content-settings.tsx` which does import `useIsOffline`.

### S1-04 | Medium | Linking.openURL has no error handling
**Lines 1347, 1355, 1363.** `Linking.openURL('https://mizanly.app/terms')` etc. have no `.catch()`. If the URL can't be opened (no browser, restricted device), it throws an unhandled promise rejection. Compare with `safety-center.tsx` line 64 which correctly chains `.catch()`.

### S1-05 | Low | Hardcoded border colors in StyleSheet
**Lines 1434, 1468, 1476, 1499.** Multiple hardcoded `rgba(45,53,72,...)` values in card border, chevron background, divider, and sign-out gradient. These don't adapt to light theme — they're dark-theme-specific opacity values. Should use `tc.border` or theme tokens.

### S1-06 | Low | deleteAccountMutation uses mutateAsync without try/catch
**Lines 278-280.** Inside the Alert callback, `await deleteAccountMutation.mutateAsync()` is called without a try/catch. If the mutation's `onError` doesn't fire for some reason (e.g., network timeout without proper error), the promise rejection is unhandled. The `onPress` callback is async but Alert doesn't handle rejected promises.

### S1-07 | Low | signOut call in handleSignOut has no error handling
**Lines 242-243.** `await signOut()` inside the Alert callback has no try/catch. Clerk's signOut can fail (network error, revoked session). If it throws, the promise rejects inside an Alert callback with no handler.

### S1-08 | Info | No RTL support on search clear button hitSlop
**Line 338.** `hitSlop={8}` is fine, but the clear button `<Pressable>` has no RTL-specific adjustment. Minor since hitSlop is symmetrical.

### S1-09 | Info | No `useMemo` on massive search matching
**Lines 345, 407, 460, 529, 596, 663, 867, 921, 942, 971, 1049, 1143, 1205, 1309.** Each section renders conditionally using `matchesSearch(t(...))` on every keystroke. With 60+ settings items, each re-render calls `t()` + `toLowerCase()` + `includes()` 60+ times. Not memoized. Functionally correct but will cause perceptible lag on low-end devices.

---

## 2. theme-settings.tsx (411 lines)

### S2-01 | Medium | Fake loading via setTimeout — violates rules
**Lines 109-113.** `setTimeout(() => setIsReady(true), 100)` is a synthetic loading delay. The CLAUDE.md mobile rules explicitly say "NEVER setTimeout for fake loading". The store hydration is synchronous via Zustand persist — this delay is artificial.

### S2-02 | Medium | No offline handling
**Entire file.** The theme is set locally via `setTheme(opt.value)` (line 226) which updates Zustand store. This is local-only, so offline is arguably fine. BUT there's no persistence verification — if MMKV/AsyncStorage write fails (storage full), the setting is lost on restart. No error handling on the Zustand persist layer.

### S2-03 | Low | Hardcoded `#fff` in check icon
**Line 57.** `color="#fff"` is used for the check icon. Should use `colors.white` or a theme token — `#fff` is correct for both themes here (on emerald/gold gradient), but it bypasses the theming system.

### S2-04 | Low | ColorSwatch has hardcoded "Aa" text
**Line 75.** The string `"Aa"` inside `ColorSwatch` is not i18n'd. It's a typography sample so translation isn't strictly needed, but for RTL languages the convention might differ (e.g., Arabic uses different sample characters).

### S2-05 | Low | useColorScheme called unconditionally
**Line 106.** `useColorScheme()` is called on every render. React Native's `useColorScheme` triggers re-renders on system theme change, which is fine, but the `?? 'dark'` fallback means if the system returns `null` (no preference), it defaults to dark. Should arguably default to `'light'` or use the same default as the rest of the app.

---

## 3. notification-tones.tsx (502 lines)

### S3-01 | Critical | Missing conversationId — screen navigable without required param
**Lines 106-114.** `conversationId` comes from search params, but there's no validation. If a user navigates to this screen without a `conversationId`, `conversationId` is `undefined`, the AsyncStorage load (line 128) is skipped, and the save (line 202) early-returns silently. The user can select a tone, tap save, and nothing happens — no error feedback.

### S3-02 | Medium | No offline guard on save
**Lines 198-215.** `handleSave` writes to AsyncStorage (local), which technically works offline. BUT the lack of network check means if this were ever moved to server-side persistence, the pattern would silently fail. Currently low risk since it's local-only.

### S3-03 | Medium | handleRefresh has no error handling
**Lines 217-229.** `handleRefresh` calls `AsyncStorage.getItem()` without a `.catch()`. If AsyncStorage fails, the promise rejects unhandled. Compare with the initial load (line 135) which does have `.catch()`.

### S3-04 | Medium | btoa may not exist in all Hermes versions
**Line 98.** Comment says "btoa which is available in React Native Hermes" but `btoa` was only added to Hermes in 0.72+. If the app ever runs on an older Hermes version or a JSC environment, this crashes. Should use a polyfill or `Buffer.from(...).toString('base64')`.

### S3-05 | Low | renderToneItem missing `isRTL` and `styles` in deps
**Line 301.** `renderToneItem` useCallback has `[selectedTone, playingTone, handleSelect, handlePreview, t]` as deps, but uses `styles`, `isRTL` (via `rtlFlexRow(isRTL)` on line 244) and `tc` (line 292) without listing them. If theme or RTL changes, the callback won't update.

### S3-06 | Low | Audio.Sound not configured for background mode
**Lines 170-174.** `Audio.Sound.createAsync` is called without first configuring `Audio.setAudioModeAsync`. On iOS, the tone preview may fail if audio session category isn't set. Should call `Audio.setAudioModeAsync({ playsInSilentModeOnIOS: true })` before first play.

### S3-07 | Info | ItemSeparatorComponent is inline arrow function
**Line 346.** `ItemSeparatorComponent={() => <View style={styles.separator} />}` creates a new component reference on every render, preventing React.memo optimization on the FlatList.

---

## 4. content-settings.tsx (559 lines)

### S4-01 | Critical | StyleSheet uses hardcoded dark theme colors — breaks in light mode
**Lines 484, 498-500, 506-507, 517-518, 525, 550-551, 557-558.** The entire `styles` object at the bottom uses `StyleSheet.create` (not `createStyles(tc)`). Colors are hardcoded: `colors.dark.bg` (line 484), `colors.text.secondary` (line 499), `colors.text.primary` (line 550), `colors.text.tertiary` (line 551), `colors.dark.border` (line 517), `colors.active.white6` (line 506, 558). These are all static dark-theme values. The screen will look broken in light mode. Every other screen in this audit uses `createStyles(tc)` pattern — this one does not.

### S4-02 | Medium | hideRepostedContent toggle is dead — no onToggle
**Lines 365-371.** The `hideRepostedContent` Row has `value={hideRepostedContent}` but no `onToggle` prop. It's visually rendered at `opacity: 0.5` with a "Coming soon" label, but the toggle control still appears (via the Row component logic at line 108: `onToggle !== undefined` check). Since `onToggle` is NOT passed, the toggle won't render — only the label. This is confusing UX: the Row shows a boolean value but no way to change it. Should either hide the value or explicitly pass `onToggle={undefined}`.

### S4-03 | Medium | AsyncStorage.getItem in useEffect has no .catch()
**Lines 168-171.** The hydration of `daily-reminder-option` from AsyncStorage chains `.then()` but no `.catch()`. If AsyncStorage fails, unhandled promise rejection.

### S4-04 | Medium | wellbeingMutation has no optimistic rollback
**Lines 192-199.** `handleUpdateSensitiveContent` sets local state immediately (`setSensitiveContent(v)`) then fires mutation. If mutation fails, the `onError` shows a toast but doesn't rollback the local state. User sees toggle in the wrong position. Compare with `settings.tsx` lines 181-186 which calls `settingsQuery.refetch()` on error to rollback.

### S4-05 | Low | openPicker debounce uses setTimeout without cleanup
**Lines 183-185.** The `openPicker` callback uses `setTimeout(() => { pickerDebounceRef.current = false; }, 500)` but this timeout is never cleaned up on unmount. If the component unmounts during the 500ms window, it sets state on an unmounted ref (harmless for refs, but still not cleaned up).

### S4-06 | Low | Gradient card uses `colors.gradient.cardDark` unconditionally
**Lines 282, 355, 379, 396.** `colors.gradient.cardDark` is always used regardless of theme. In light mode, these dark gradient cards will look wrong. Related to S4-01.

### S4-07 | Info | `useSafFeedType()` and `useMajlisFeedType()` are called as hooks at top level
**Lines 141-142.** These are custom selectors — fine. But if the Zustand store hasn't hydrated yet, they return defaults. No loading guard for store hydration (unlike theme-settings which has an artificial delay).

---

## 5. blocked.tsx (236 lines)

### S5-01 | Medium | ScreenErrorBoundary not wrapping error state
**Lines 147-163.** The error state branch (`query.isError`) renders without `<ScreenErrorBoundary>`. If the `EmptyState` component throws during the error render, it crashes. The main success branch (line 166) correctly wraps.

### S5-02 | Medium | confirmUnblock uses Alert.alert — violates mobile-screen rules
**Lines 80-89.** The rule says "showToast() for mutation feedback, NEVER bare Alert.alert for non-destructive". This IS destructive (unblock is intentional), so `Alert.alert` for confirmation is acceptable. However, the callback `unblockMutation.mutate(item.blocked.id)` has no loading indication during the alert — user can tap unblock multiple times rapidly before the alert dismisses.

### S5-03 | Low | renderBlockedItem has `confirmUnblock` in deps but it's not memoized
**Line 144.** `renderBlockedItem` useCallback depends on `confirmUnblock`, but `confirmUnblock` is defined as a regular function (line 80) — it recreates on every render, causing `renderBlockedItem` to also recreate every render, defeating the memoization.

### S5-04 | Low | Hardcoded border color in row style
**Line 224.** `borderColor: 'rgba(248,81,73,0.2)'` is hardcoded. While this is intentionally red-tinted for the blocked user card, it doesn't adapt to light theme opacity expectations.

### S5-05 | Info | No empty text when offline
**Entire file.** `isOffline` is imported and used to disable the unblock button (line 135), but there's no visual indicator when the entire list is empty due to being offline vs. genuinely having no blocked users.

---

## 6. muted.tsx (222 lines)

### S6-01 | Medium | No offline guard — unmute fires while offline
**Lines 118-121.** The unmute button fires `unmuteMutation.mutate(u.id)` without checking `useIsOffline()`. The hook isn't even imported. If offline, the mutation fails with a generic error toast. Should disable button or show offline message, like `blocked.tsx` does.

### S6-02 | Medium | ScreenErrorBoundary not wrapping error state
**Lines 132-148.** Same pattern as blocked.tsx — the error state renders without `<ScreenErrorBoundary>`, while the success state (line 151) has it.

### S6-03 | Medium | unmuteMutation.onSuccess doesn't invalidate related queries
**Lines 64-69.** When a user is unmuted, only `['muted']` query is invalidated. But the muted status affects the user's profile page and potentially feed visibility. Compare with `blocked.tsx` lines 63-65 which also invalidates `['profile', unblockedUserId]` and `['user', unblockedUserId]`.

### S6-04 | Low | Hardcoded gap value `6` in skeleton
**Lines 81, 163.** `gap: 6` is used instead of `spacing.sm` (which is 8). This is a minor magic number that should use the spacing scale.

### S6-05 | Low | Hardcoded border colors in styles
**Lines 200, 210.** `borderColor: colors.active.white6` is a dark-theme-specific token used unconditionally. In light mode, this may appear wrong.

### S6-06 | Low | `isRTL` destructured but never used
**Line 40.** `const { t, isRTL } = useTranslation()` — `isRTL` is destructured but never referenced in the component. The FlatList items don't use RTL layout adjustments, so `displayName` and `@username` text won't align correctly in RTL languages.

---

## 7. report.tsx (355 lines)

### S7-01 | Critical | No validation of required search params
**Lines 44, 54.** `params.type` and `params.id` come from `useLocalSearchParams`. If either is missing (user navigates directly, deep link attack, or routing error), the mutation proceeds to the switch statement where `type` is undefined, hits `default`, and throws `"Unsupported report type: undefined"`. But this error is only caught by the mutation's `onError` which shows a toast. The user sees a confusing error message. Should validate params on mount and show an error state.

### S7-02 | Medium | No offline guard
**Entire file.** `useIsOffline` is not imported. If the user is offline, they can fill out the entire report form, tap submit, and get a network error toast. Bad UX — should show offline warning before they invest time writing details.

### S7-03 | Medium | Report can be submitted with whitespace-only details
**Line 67.** `description: details.trim() || undefined` — this correctly strips whitespace. BUT `selectedReason` (line 55) is never trimmed or validated beyond non-empty string check. Since reasons come from the hardcoded `REASONS` array (line 30), this is safe. However, if a future developer adds dynamic reasons, this could be an issue.

### S7-04 | Low | Hardcoded `colors.active.white6` for dark theme borders
**Lines 281, 323.** `borderColor: colors.active.white6` doesn't adapt to light theme.

### S7-05 | Low | No duplicate report prevention
**Entire file.** User can submit the same report multiple times (same type + id + reason). The mutation has no idempotency check. If the button loading state is slow, rapid taps could create duplicate reports. The `isPending` check on line 228 helps but race conditions exist.

### S7-06 | Info | headerSpacer uses fixed height
**Lines 131, 249.** `height: 100` is a magic number for spacing below the glass header. This doesn't account for different device sizes, notch heights, or dynamic type.

---

## 8. safety-center.tsx (125 lines)

### S8-01 | Medium | Navigation to non-existent routes
**Lines 35-36.** `router.push('/(screens)/report' as never)` pushes to `/report` without required `type` and `id` params. The report screen (S7-01) requires these. This will result in an error on the report screen. Should either not link to report from here, or provide default params.

### S8-02 | Medium | `router.push` uses `as never` type assertion
**Lines 35, 39, 43, 48, 54.** Every `router.push()` call casts the route to `as never`. This defeats TypeScript's route checking entirely. If any of these routes are renamed or removed, TypeScript won't catch the error. This is effectively `@ts-ignore` on navigation.

### S8-03 | Low | isNavigatingRef timeout never cleaned up
**Lines 27, 90.** The `isNavigatingRef.current = false` inside `setTimeout(..., 500)` is never cleaned up on unmount. If the component unmounts during the 500ms window, the timeout fires on a stale ref (harmless but unclean).

### S8-04 | Low | No loading state
**Entire file.** The screen is fully static (no API calls), so no loading state is needed. However, it hardcodes items in the `items` array — if these were ever fetched from an API, the pattern would need a full rewrite.

### S8-05 | Low | Linking.openURL error toast uses custom key not in error pattern
**Line 65.** `t('safety.crisisLinkOffline', 'Unable to open link...')` — the key `safety.crisisLinkOffline` may not exist in all 8 i18n files. The fallback text is English-only. Should verify this key exists in ar, tr, ur, bn, fr, id, ms.

### S8-06 | Info | No scroll padding for header
**Line 76.** The `ScrollView` has no `paddingTop` to account for the `GlassHeader` overlay. Items may render behind the glass header on initial load.

---

## 9. parental-controls.tsx (~901 lines)

### S9-01 | Critical | PIN stored/transmitted in plain text — no hashing
**Lines 525-554.** The PIN is sent to `parentalApi.verifyPin(firstChildId!, pin)` as plaintext. Lines 476, 499 also send PINs in plaintext for unlink and change operations. A 4-digit numeric PIN sent over HTTPS is minimally protected, but:
- It should be hashed client-side before transmission (even simple SHA-256 is better than plaintext)
- Server-side storage of the PIN is unknown from this code, but the API pattern suggests comparison happens server-side
- No rate limiting on the client side beyond the 5-attempt lock (line 530), which resets on component remount

### S9-02 | Critical | PIN lockout resets on component remount
**Line 460.** `pinAttempts` is `useState(0)`. If the user leaves the screen and comes back, the attempt counter resets to 0. The 5-attempt lockout (line 530) is purely in-memory and trivially bypassed by navigating away and returning.

### S9-03 | Medium | Non-null assertion on firstChildId
**Line 535.** `parentalApi.verifyPin(firstChildId!, pin)` uses `!` non-null assertion. If `controlCheckData` is empty but `hasControls` is somehow true (race condition between query refetch), this crashes.

### S9-04 | Medium | No error state for childrenQuery
**Lines 467-471, 660-712.** The `childrenQuery` has no `.isError` check. If the children fetch fails after PIN verification, the FlatList renders with empty data and shows the `EmptyState` ("no children linked"), which is misleading — the user has children but the API failed.

### S9-05 | Medium | updateMutation allows rapid-fire updates
**Lines 298-307, 317-319.** The `update` function checks `updateMutation.isPending` to prevent concurrent mutations, but multiple different fields can race: toggling `restrictedMode` then immediately toggling `canPost` will fire two mutations in sequence, potentially with stale data. Should queue or debounce.

### S9-06 | Medium | No offline handling
**Entire file.** `useIsOffline` is not imported. PIN verification, control updates, unlink, and change-PIN all fire API calls without offline checks. Particularly bad for PIN verification — an offline API call returns a network error, which increments `pinAttempts`, punishing the user for network issues.

### S9-07 | Low | PinPad has no visual feedback for wrong PIN
**Lines 65-98.** When `onComplete` is called and the PIN is wrong, the PinPad resets to empty (`setPin('')` on line 52) with no shake animation or color change on the dots. The parent component shows an error text below (line 647), but the PinPad itself gives no feedback.

### S9-08 | Low | ChildCard local state doesn't sync with server response
**Lines 309-316.** Local state (`restrictedMode`, `maxAgeRating`, etc.) is initialized from `control` prop, but if `childrenQuery` refetches with different data (e.g., another parent changed settings), the local state is stale because `useState` initial value is only used on first render.

### S9-09 | Info | renderChildItem has unstable deps
**Lines 588-597.** `renderChildItem` useCallback depends on `handleUnlink` and `handleChangePin`, which are both regular functions that recreate every render. The memoization is ineffective.

---

## 10. screen-time.tsx (656 lines)

### S10-01 | Medium | No error state for statsQuery
**Lines 155-158, 201-222.** `statsQuery.isLoading` is handled with a skeleton. But `statsQuery.isError` is never checked. If the API fails, `stats` is `undefined`, and the screen renders with all zeros (0m today, empty chart, 0 sessions). User thinks they haven't used the app today when really the data just failed to load.

### S10-02 | Medium | No offline handling
**Entire file.** `useIsOffline` is not imported. The `limitMutation.mutate(value)` fires without offline check (line 190). If offline, the mutation fails, showing an error toast, but the local store has already been updated via `setScreenTimeLimitMinutes(value)` (line 189), creating a local/server desync.

### S10-03 | Medium | Bedtime toggle has no visual state indicator
**Lines 389-429.** The bedtime mode toggle reads from AsyncStorage, toggles, and writes back. But there's no local state tracking whether bedtime is currently enabled. The UI renders identically whether bedtime is on or off — no toggle dot, no color change, no checkmark. It's a button that shows a toast but the visual state is invisible.

### S10-04 | Medium | onRefresh only invalidates, doesn't await refetch
**Lines 178-181.** `queryClient.invalidateQueries(...)` is called but not awaited with `refetchType`. The `setRefreshing(false)` fires immediately after invalidation, not after the data actually arrives. The refresh spinner disappears before data updates, giving false completion feedback.

### S10-05 | Low | Bedtime toggle reads then writes — race condition
**Lines 391-401.** `AsyncStorage.getItem('bedtime_enabled').then(val => { ... AsyncStorage.setItem(...) })` is a read-then-write pattern. If two rapid taps occur, the second read can happen before the first write completes, causing the toggle to flicker or land on the wrong state. The comment on line 388 says "Atomic bedtime toggle — no async read+write race" but this IS a race condition.

### S10-06 | Low | `colors.gradient.cardDark` used unconditionally for charts/stats
**Lines 121, 283, 320, 360, 407.** All gradient cards use dark-theme gradients regardless of the actual theme.

### S10-07 | Low | formatLimitLabel function duplicates getLimitLabel
**Lines 48-52 and 37-43.** Two nearly identical functions for formatting limit labels. `getLimitLabel` handles `>= 60` with hours, `formatLimitLabel` handles `>= 60` with hours AND remaining minutes. The duplication is error-prone if one is updated but not the other.

### S10-08 | Info | BarChart getWeekDays creates new Date objects on every render
**Lines 64-72.** `getWeekDays()` is called inside the `BarChart` component render without memoization. Creates 7 Date objects per render. Minor but unnecessary.

---

## Cross-Cutting Issues

### X-01 | Critical | content-settings.tsx uses static StyleSheet instead of createStyles(tc) pattern
All other 9 screens use the `createStyles(tc)` pattern for theme-adaptive styles. `content-settings.tsx` is the only screen that uses a static `StyleSheet.create` with hardcoded dark theme values. This will break entirely in light mode.

### X-02 | High | 6 of 10 screens have no offline handling
`settings.tsx`, `theme-settings.tsx`, `report.tsx`, `safety-center.tsx`, `parental-controls.tsx`, and `screen-time.tsx` don't use `useIsOffline`. Only `content-settings.tsx` and `blocked.tsx` properly check offline state. `muted.tsx` and `notification-tones.tsx` partially handle it.

### X-03 | High | ScreenErrorBoundary inconsistently wraps error states
`blocked.tsx` (line 147), `muted.tsx` (line 132), and `settings.tsx` (line 291) all have branches that render error/loading states OUTSIDE the `<ScreenErrorBoundary>`. If any component inside those branches throws, the crash is unhandled.

### X-04 | Medium | Multiple screens have unstable useCallback deps
`blocked.tsx` (S5-03), `muted.tsx` (line 129 — unmuteMutation in deps is unstable), `parental-controls.tsx` (S9-09), `notification-tones.tsx` (S3-05). This defeats FlatList virtualization memoization, causing unnecessary re-renders on long lists.

### X-05 | Medium | `as never` route casting used in safety-center.tsx
**Lines 35, 39, 43, 48, 54** in safety-center.tsx. This bypasses Expo Router's type-safe routing. If routes change, these will fail at runtime with no compile-time warning.

### X-06 | Low | Hardcoded dark-theme gradient colors across 5 screens
`content-settings.tsx`, `muted.tsx`, `blocked.tsx`, `report.tsx`, `screen-time.tsx` all use `colors.gradient.cardDark` or `colors.active.white6` without theme-conditional logic. These will look wrong in light mode.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High (via cross-cutting) | 3 |
| Medium | 20 |
| Low | 19 |
| Info | 7 |
| **Total** | **54** |

### Critical Findings
1. **S4-01** — content-settings.tsx hardcoded dark theme StyleSheet (breaks light mode)
2. **S9-01** — Parental PIN sent plaintext, no client-side hashing
3. **S9-02** — PIN lockout resets on navigation (trivially bypassed)
4. **S3-01** — notification-tones navigable without required conversationId param
5. **S7-01** — report.tsx has no validation of required type/id search params

### Top Priority Fixes
1. Convert content-settings.tsx to `createStyles(tc)` pattern (S4-01/X-01)
2. Add offline guards to all 6 missing screens (X-02)
3. Persist PIN attempt count in AsyncStorage (S9-02)
4. Hash PIN client-side before API transmission (S9-01)
5. Wrap all loading/error branches with ScreenErrorBoundary (X-03)
6. Add settingsQuery.isError handling in settings.tsx (S1-02)
7. Validate required search params in report.tsx and notification-tones.tsx (S7-01, S3-01)
