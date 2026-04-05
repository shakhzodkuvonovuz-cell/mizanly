# M09 — Events, Challenges, Gamification & Seasonal Screens

**Scope:** 10 files, ~4,200 lines  
**Auditor:** Claude Opus 4.6 (1M context)  
**Date:** 2026-04-05  
**Verdict:** Mixed. Most screens follow project patterns well but have recurring issues around timezone handling, hardcoded colors, missing RTL, and inconsistent cleanup.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 10 |
| Medium | 22 |
| Low | 14 |
| Info | 5 |
| **Total** | **53** |

---

## Findings

### F01 — [Critical] create-event.tsx: startDate/endDate validation allows end before start
**File:** `create-event.tsx` lines 146-175  
**Issue:** `handleSubmit` sends `startDate` and `endDate` directly to the API with no validation that `endDate > startDate`. A user can set start at 5 PM and end at 3 PM. The only guard is in the date picker (`minimumDate` on the end picker, line 688), but the native picker is optional (`RNDateTimePicker` can be null in Expo Go). In the fallback quick-select mode (lines 696-719), the option buttons compute offsets from `new Date()` — not from `startDate` — so selecting "in one hour" for end date could still be before start date if the user previously set start to "tomorrow."

### F02 — [Critical] create-event.tsx: No title validation before submit
**File:** `create-event.tsx` lines 146-175  
**Issue:** `handleSubmit` calls `eventsApi.create(dto)` with `title: title.trim()` but never checks if the title is empty. The submit button (line 635) has no `disabled` guard based on empty title. An empty-title event will be sent to the API. The button's only guard is `submitting` state.

### F03 — [High] event-detail.tsx: Share message is not i18n — hardcoded English template
**File:** `event-detail.tsx` lines 252-253, 521-523  
**Issue:** `Share.share({ message: \`\${event.title} — \${formatEventDate(event.startDate)}\${event.location ? \` at \${event.location}\` : ''}\` })` — The word "at" is hardcoded English. This string is shared externally and should use `t('events.shareMessage', { title, date, location })` or similar. Appears twice (header share + bottom bar share).

### F04 — [High] event-detail.tsx: formatEventDate/formatEventTime use device locale, not user's chosen locale
**File:** `event-detail.tsx` lines 45-62  
**Issue:** `new Date(dateStr).toLocaleDateString(undefined, ...)` uses the device system locale, not the app's i18n locale. The rest of the app uses `@/utils/localeFormat` (create-event.tsx imports `formatDateTime` from it at line 49). These two helper functions bypass the app locale entirely. An Arabic-speaking user on an English-locale device would see English date formatting.

### F05 — [High] event-detail.tsx: Dates displayed without timezone context
**File:** `event-detail.tsx` lines 45-62  
**Issue:** `new Date(dateStr)` interprets the ISO string in local device timezone. If the event was created in UTC+3 (Riyadh) and viewed in UTC+11 (Sydney), the displayed date/time will be shifted by 8 hours with no timezone indicator. The user has no way to know which timezone the times represent. Events should either store timezone or display the timezone offset.

### F06 — [High] dhikr-challenges.tsx: Hardcoded `colors.dark.*` in StyleSheet
**File:** `dhikr-challenges.tsx` lines 340-341, 357-358, 388-389  
**Issue:** `backgroundColor: colors.dark.bg`, `backgroundColor: colors.dark.bgCard`, `backgroundColor: colors.dark.surface`, `borderColor: colors.dark.border` — all hardcoded to dark theme. Project rule: use `tc.*` from `useThemeColors()`. These styles won't adapt to any future light theme. Compare to `dhikr-challenge-detail.tsx` which has the same pattern at lines 347, 370, 374, 445, 487.

### F07 — [High] dhikr-challenge-detail.tsx: Hardcoded `colors.dark.*` in StyleSheet
**File:** `dhikr-challenge-detail.tsx` lines 347, 370, 374, 445, 487  
**Issue:** Same as F06. `backgroundColor: colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.surface` in StyleSheet.create. These are not using theme-aware `tc.*` tokens.

### F08 — [High] morning-briefing.tsx: Hardcoded `colors.dark.bg` in container style
**File:** `morning-briefing.tsx` line 523  
**Issue:** `container: { flex: 1, backgroundColor: colors.dark.bg }` — hardcoded dark theme. The component correctly passes `{ backgroundColor: tc.bg }` as inline style on line 224, which overrides this, but the StyleSheet value is still incorrect and would flash the wrong color on mount before tc resolves.

### F09 — [High] morning-briefing.tsx: Audio Sound leak on rapid toggling
**File:** `morning-briefing.tsx` lines 124-159  
**Issue:** `playAyahAudio` checks `if (soundRef.current)` and tries to stop/unload, but if `stopAsync()` throws (e.g., already stopped), the function swallows it and continues to create a new sound. Meanwhile `soundRef.current` was set to null on line 130, so if the new `Sound.createAsync` also fails, the original sound is leaked. The cleanup `useEffect` on line 171 only handles a single `soundRef.current`. Rapid tapping the play button could orphan Sound instances.

### F10 — [High] ramadan-mode.tsx: Prayer time parsing assumes "HH:MM" format without validation
**File:** `ramadan-mode.tsx` lines 285-296  
**Issue:** `const [mH, mM] = maghribTime.split(':').map(Number)` — no validation that the split produces exactly 2 parts or that the values are valid numbers. If the API returns "6:12 PM" (12-hour format) or any unexpected format, `Number("12 PM")` returns NaN, and `setHours(NaN, NaN, 0, 0)` produces an Invalid Date. The countdown would silently break.

### F11 — [High] ramadan-mode.tsx: Taraweeh time computation is fragile
**File:** `ramadan-mode.tsx` line 327  
**Issue:** ``parseInt(pt.isha.split(':')[0]) + 1 + ':00'`` — if Isha is "23:30", taraweeh becomes "24:00" which is not a valid time string. If Isha is "7:35 PM" (12-hour), `parseInt("7")` gives 7, taraweeh becomes "8:00" — but that's 8 AM, not 8 PM. No AM/PM handling, no 24-hour rollover.

### F12 — [High] ramadan-mode.tsx: Goals state is local only — resets on remount
**File:** `ramadan-mode.tsx` lines 229, 338-349  
**Issue:** `const [goals, setGoals] = useState<DailyGoal[]>(INITIAL_GOALS)` — initial state is always the same hardcoded array with `dhikr: completed: true` and all others false. The `toggleGoal` function calls `islamicApi.completeDailyTask(id)` to persist, but on remount the state resets to `INITIAL_GOALS`. The API response from `ramadanQuery` is never used to hydrate goal completion status. Goal state is lost on every screen visit.

### F13 — [Medium] create-event.tsx: Draft persistence saves but doesn't save dates
**File:** `create-event.tsx` lines 98-111  
**Issue:** `EventDraft` interface includes `title, description, location, eventType, privacy, isOnline, allDay, selectedCommunity` but NOT `startDate`, `endDate`, `coverUri`, `reminder1h`, or `reminder1d`. Restoring a draft loses the user's selected dates and cover photo.

### F14 — [Medium] create-event.tsx: Cover image URI not uploaded — event created without cover
**File:** `create-event.tsx` lines 146-175  
**Issue:** `pickCoverPhoto` stores the local URI in `coverUri` state, but `handleSubmit` builds `dto: CreateEventDto` without any image field. The cover image is never uploaded to R2 or sent to the API. The user sees their cover photo in the form but the created event has no cover.

### F15 — [Medium] create-event.tsx: `showDatePicker` useEffect re-reads dates on every render
**File:** `create-event.tsx` lines 129-135  
**Issue:** `useEffect` depends on `[showDatePicker, startDate, endDate]`. Every time `startDate` or `endDate` changes (even when picker is closed / `showDatePicker === null`), this effect runs and calls `setTempDate`. Since the condition short-circuits when `showDatePicker === null`, it's just wasted work — not a bug but unnecessary.

### F16 — [Medium] create-event.tsx: Missing RTL support in bottom bar
**File:** `create-event.tsx` line 628  
**Issue:** `bottomBar` uses `flexDirection: 'row'` (via StyleSheet) with no `rtlFlexRow(isRTL)`. Arabic users will see save-draft on the left and create on the right, which is the wrong visual order for RTL.

### F17 — [Medium] event-detail.tsx: `isNavigatingRef` setTimeout cleanup missing
**File:** `event-detail.tsx` lines 494-498  
**Issue:** `setTimeout(() => { isNavigatingRef.current = false; }, 500)` — the timeout is never cleared on unmount. If the component unmounts within 500ms (navigation), the callback fires on an unmounted ref. Not a crash (refs survive unmount) but is a pattern smell.

### F18 — [Medium] event-detail.tsx: Bottom RSVP confirm button has no onPress handler
**File:** `event-detail.tsx` lines 536-549  
**Issue:** The bottom bar contains a "RSVP: Going/Maybe/..." Pressable, but it has no `onPress` handler. It's just disabled when mutation is pending. The button is purely visual — tapping it does nothing. It should either scroll to the RSVP section or open a bottom sheet.

### F19 — [Medium] event-detail.tsx: `onError` context type not inferred correctly
**File:** `event-detail.tsx` line 140  
**Issue:** `onError: (_err, _vars, context: { previousStatus: RsvpStatus } | undefined)` — The context type annotation is manually added but TanStack Query v5 infers context from `onMutate`'s return type. The explicit annotation could drift from the actual `onMutate` return if modified later.

### F20 — [Medium] challenges.tsx: `renderCategoryChip` callback is defined but never used
**File:** `challenges.tsx` lines 309-345  
**Issue:** `const renderCategoryChip = useCallback(...)` is defined with full logic, but the actual rendering (lines 381-427) uses a `ScrollView` + `.map()` approach instead. The `renderCategoryChip` callback is dead code.

### F21 — [Medium] challenges.tsx: FlatList `data` empty check triggers wrong empty component on error
**File:** `challenges.tsx` lines 466-483  
**Issue:** `ListEmptyComponent` checks `discoverQuery.isError` to show error state, but this check runs every render. If the query errored then succeeded (stale data), the error state could flash. Better to check `isError && !data` explicitly.

### F22 — [Medium] challenges.tsx: Discover query doesn't surface error state in main loading flow
**File:** `challenges.tsx` lines 290-291  
**Issue:** `isLoading` only checks for initial loading. If the initial load succeeds but a later refetch errors, the error is only surfaced via `ListEmptyComponent` when the list is empty. A refetch error with existing data is silently swallowed — no toast or error banner.

### F23 — [Medium] dhikr-challenges.tsx: `renderItem` has `router` in dependency array but uses `navigate` instead
**File:** `dhikr-challenges.tsx` line 201  
**Issue:** `}, [router])` — the dependency array lists `router` but the callback body calls `navigate(...)` (imported from `@/utils/navigation`), not `router.push`. Stale closure is harmless since `navigate` is a module-level function, but the dependency is misleading.

### F24 — [Medium] dhikr-challenges.tsx: `creating` state is declared but never used
**File:** `dhikr-challenges.tsx` line 131  
**Issue:** `const [creating, setCreating] = useState(false)` — never read, never set after initialization. Dead state.

### F25 — [Medium] dhikr-challenges.tsx: No input validation feedback for create challenge
**File:** `dhikr-challenges.tsx` lines 182-192  
**Issue:** `handleCreate` silently returns if title is empty or target < 100. No toast, no error message, no visual feedback. The user taps "Create" and nothing happens. Should show `showToast({ message: ..., variant: 'error' })`.

### F26 — [Medium] dhikr-challenges.tsx: `refreshing` state duplicates react-query's built-in state
**File:** `dhikr-challenges.tsx` lines 173, 176-179  
**Issue:** `const [refreshing, setRefreshing] = useState(false)` manually tracks refresh state, but `useInfiniteQuery` already provides `isRefetching`. This creates a brief mismatch: when `refetch()` resolves, `setRefreshing(false)` fires — but if the refetch errors, `isRefetching` was already false and `refreshing` stays true until `finally` (which doesn't exist here). Same pattern in dhikr-challenge-detail.tsx lines 119, 156-159.

### F27 — [Medium] dhikr-challenge-detail.tsx: `_isParticipant` is computed but never used
**File:** `dhikr-challenge-detail.tsx` line 185  
**Issue:** `const _isParticipant = (detail?.participantCount ?? 0) > 0` — underscore-prefixed unused variable. Comment says "#46 fix" but the variable is dead code. The "Join" button is always shown regardless of participation status.

### F28 — [Medium] dhikr-challenge-detail.tsx: Join button always shown even if already a participant
**File:** `dhikr-challenge-detail.tsx` lines 228-237  
**Issue:** The "Join Challenge" button renders unconditionally (when `!showContribute`). A user who already joined can tap "Join" again, potentially causing duplicate join API calls. Should check participation status and show "Joined" state.

### F29 — [Medium] leaderboard.tsx: `isNavigatingRef` is declared but never used in LeaderboardScreen
**File:** `leaderboard.tsx` line 221  
**Issue:** `const isNavigatingRef = useRef(false)` — declared in `LeaderboardScreen` but never referenced. The actual navigation refs are inside `PodiumCard` and `LeaderboardRow` components which have their own. Dead code.

### F30 — [Medium] leaderboard.tsx: No error state for query failure
**File:** `leaderboard.tsx` lines 305-312  
**Issue:** The loading check (`isLoading`) and empty check (`entries.length === 0`) are handled, but there's no explicit error state. If `gamificationApi.getLeaderboard` throws, the entries will be `[]` and the user sees the empty state with "Retry" — but the error message is the generic "No Data" text, not an error indicator.

### F31 — [Medium] leaderboard.tsx: `bgCard + 'CC'` string concatenation for alpha
**File:** `leaderboard.tsx` line 128  
**Issue:** `tc.bgCard + 'CC'` and `tc.bgCard + '33'` — appends hex alpha to the color string. This only works if `tc.bgCard` is a 6-digit hex like `#1A1D23`. If it's `rgb(...)`, `rgba(...)`, or a named color, the result is garbage. Fragile.

### F32 — [Medium] xp-history.tsx: `createStyles` called inside every render of sub-components
**File:** `xp-history.tsx` lines 71, 125, 160  
**Issue:** `LevelBadge`, `XPEventRow`, and `LoadingSkeleton` each call `const styles = useMemo(() => createStyles(tc), [tc])`. While memoized per `tc` reference, `StyleSheet.create` is called once per unique `tc` object. If `useThemeColors()` returns a new object reference on each render (common pattern), every row re-creates styles. The main `XPHistoryScreen` does this correctly, but sub-components should receive styles as props or use a context.

### F33 — [Medium] xp-history.tsx: `handleRefresh` is async but BrandedRefreshControl may not wait
**File:** `xp-history.tsx` lines 215-217  
**Issue:** `handleRefresh` is `async () => { await Promise.all([...]) }`. `BrandedRefreshControl` passes `onRefresh={handleRefresh}`. React Native's `RefreshControl` doesn't await the promise — the spinning stops when `refreshing` prop becomes false. But `refreshing={xpQuery.isRefetching || historyQuery.isRefetching}` is already the right source, so the `await` is unnecessary noise. Not a bug but misleading.

### F34 — [Medium] whats-new.tsx: Changelog dates are not localized
**File:** `whats-new.tsx` line 49  
**Issue:** `{release.date}` renders raw `'2026-03-25'` string. Should be formatted with `localeFormatDateTime` or `date-fns format` for the user's locale.

### F35 — [Medium] whats-new.tsx: No pull-to-refresh or error state
**File:** `whats-new.tsx` lines 32-69  
**Issue:** The screen is purely static (renders `CHANGELOG` array), which is fine — but there's no loading state or empty state if `CHANGELOG` were empty. Minor, since it's hardcoded, but inconsistent with other screens.

### F36 — [Medium] morning-briefing.tsx: DhikrCounter state resets on re-render from parent
**File:** `morning-briefing.tsx` lines 71-109  
**Issue:** `DhikrCounter` initializes `count` from `initialCount` prop on mount. If the parent re-renders with a different `initialCount` (after query refetch), the counter doesn't update because `useState` only uses the initial value. The user's local count and server count can drift permanently.

### F37 — [Medium] morning-briefing.tsx: `playAyahAudio` toggle logic race condition
**File:** `morning-briefing.tsx` lines 126-132  
**Issue:** The toggle check `if (isPlayingAyah) { setIsPlayingAyah(false); return; }` references the stale `isPlayingAyah` from the closure. Since `useCallback` depends on `[isPlayingAyah, t]`, it does re-create on state change. But between the state update and the re-render, a rapid double-tap could call the old closure where `isPlayingAyah` is still `false`, causing two sounds to play simultaneously.

### F38 — [Medium] morning-briefing.tsx: No RTL support in card layouts
**File:** `morning-briefing.tsx` lines 579-582  
**Issue:** `cardHeader` uses `flexDirection: 'row'` without `rtlFlexRow(isRTL)`. The icon, title, and play button will be in LTR order even for Arabic users. Same applies to `progressHeader` (line 547), `prayerTimesGrid` (line 598), etc.

### F39 — [Low] create-event.tsx: `error` state is set but never displayed
**File:** `create-event.tsx` line 77, 169  
**Issue:** `const [error, setError] = useState<string | null>(null)` is set on line 169 `setError(message)` but never rendered in the JSX. The user only sees the toast but the `error` state variable is dead weight.

### F40 — [Low] create-event.tsx: `Dimensions.get('window')` imported but unused
**File:** `create-event.tsx` line 10  
**Issue:** `Dimensions` is imported from react-native but never used in the component.

### F41 — [Low] event-detail.tsx: `rtlTextAlign` imported but never used
**File:** `event-detail.tsx` line 34  
**Issue:** `import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl'` — `rtlTextAlign` is imported but never called.

### F42 — [Low] challenges.tsx: `shadow` imported but only used in FAB
**File:** `challenges.tsx` line 23  
**Issue:** `shadow` imported from theme but only used once in `fabGradient`. Minor — not wrong, just worth noting the limited use.

### F43 — [Low] challenges.tsx: `FadeIn` imported but unused
**File:** `challenges.tsx` line 12  
**Issue:** `import Animated, { FadeInUp, FadeIn }` — `FadeIn` is never used, only `FadeInUp`.

### F44 — [Low] dhikr-challenges.tsx: `FlatList` in `SafeAreaView` without proper top padding
**File:** `dhikr-challenges.tsx` line 207  
**Issue:** `SafeAreaView` wraps the content, but `GlassHeader` is positioned absolutely. `listContent` has `paddingTop: 100` to account for this. If the header height changes, this breaks. Should use a dynamic measurement or the header's actual height.

### F45 — [Low] dhikr-challenge-detail.tsx: `renderHeader` has extensive dependency array
**File:** `dhikr-challenge-detail.tsx` line 299  
**Issue:** `useCallback` with 9 dependencies including `detail`, `showContribute`, `contributeCount`, mutations, and handlers. Since `detail` changes on every refetch, the callback is recreated frequently, negating the memoization benefit. Consider splitting the header into a separate component.

### F46 — [Low] leaderboard.tsx: Hardcoded `#FFFFFF` and `#000` colors
**File:** `leaderboard.tsx` lines 385, 426  
**Issue:** `color: '#FFFFFF'` in `tabLabelActive` and `color: '#000'` in `medalText`. Should use `tc.text.primary` and `tc.text.inverse` or theme tokens.

### F47 — [Low] xp-history.tsx: `haptic` declared but never used
**File:** `xp-history.tsx` line 184  
**Issue:** `const haptic = useContextualHaptic()` — never called anywhere in `XPHistoryScreen`.

### F48 — [Low] xp-history.tsx: `insets` declared but never used
**File:** `xp-history.tsx` line 183  
**Issue:** `const insets = useSafeAreaInsets()` — never referenced.

### F49 — [Low] morning-briefing.tsx: `reflectionInput` has duplicate `borderColor` property
**File:** `morning-briefing.tsx` line 469  
**Issue:** `style={[styles.reflectionInput, { borderColor: tc.border }, { color: tc.text.primary, borderColor: tc.border }]}` — `borderColor: tc.border` is set twice in two consecutive style objects. Redundant.

### F50 — [Low] ramadan-mode.tsx: `INITIAL_GOALS` has dhikr hardcoded as `completed: true`
**File:** `ramadan-mode.tsx` line 59  
**Issue:** `{ id: 'dhikr', icon: 'circle', label: '...', completed: true }` — Hardcoded initial completion for dhikr. Combined with F12 (state never hydrated from API), this means dhikr always shows as completed on every visit.

### F51 — [Info] create-event.tsx: `useMemo` for styles but component re-renders on every keystroke
**File:** `create-event.tsx` line 62  
**Issue:** `const styles = useMemo(() => createStyles(tc), [tc])` — correct memoization, but the component has ~15 `useState` hooks. Every keystroke in title/description triggers a full re-render. Not a bug, but `TextInput` uncontrolled mode or debouncing could improve performance.

### F52 — [Info] challenges.tsx: `content` style has hardcoded `paddingTop: 100`
**File:** `challenges.tsx` line 524  
**Issue:** Same pattern as F44 — hardcoded offset for absolutely-positioned `GlassHeader`. Multiple screens share this assumption.

### F53 — [Info] ramadan-mode.tsx: `DAY_CELL_SIZE` uses `Dimensions.get('window')` at module scope
**File:** `ramadan-mode.tsx` line 543  
**Issue:** `const { width } = Dimensions.get('window')` and `const DAY_CELL_SIZE = (width - 64 - 50) / 6` — computed once at module load. If the user rotates the device or uses split-screen, the cell size is stale. Should use `useWindowDimensions()` inside the component.

---

## Per-File Summary

| File | Findings | Critical | High | Medium | Low | Info |
|------|----------|----------|------|--------|-----|------|
| `create-event.tsx` | 8 | 2 | 0 | 3 | 2 | 1 |
| `event-detail.tsx` | 6 | 0 | 2 | 3 | 1 | 0 |
| `challenges.tsx` | 4 | 0 | 0 | 3 | 1 | 0 |
| `dhikr-challenges.tsx` | 5 | 0 | 1 | 3 | 1 | 0 |
| `dhikr-challenge-detail.tsx` | 4 | 0 | 1 | 2 | 1 | 0 |
| `leaderboard.tsx` | 4 | 0 | 0 | 2 | 1 | 1 |
| `xp-history.tsx` | 5 | 0 | 0 | 2 | 2 | 1 |
| `whats-new.tsx` | 2 | 0 | 0 | 2 | 0 | 0 |
| `morning-briefing.tsx` | 6 | 0 | 2 | 3 | 1 | 0 |
| `ramadan-mode.tsx` | 7 | 0 | 3 | 1 | 1 | 2 |

---

## Recurring Patterns

1. **Hardcoded `colors.dark.*` in StyleSheet** (F06, F07, F08): 3 files use dark-theme-specific color tokens in `StyleSheet.create` instead of `tc.*`. This pattern is present in `dhikr-challenges.tsx`, `dhikr-challenge-detail.tsx`, and `morning-briefing.tsx`.

2. **Missing RTL in flexDirection** (F16, F38): `create-event.tsx` bottom bar and `morning-briefing.tsx` card headers use `flexDirection: 'row'` without `rtlFlexRow(isRTL)`.

3. **Hardcoded `paddingTop: 100`** (F44, F52): Multiple screens assume `GlassHeader` is exactly 100px tall. Fragile coupling.

4. **Manual refresh state vs react-query's `isRefetching`** (F26): `dhikr-challenges.tsx` and `dhikr-challenge-detail.tsx` both maintain a separate `refreshing` boolean that duplicates what react-query provides.

5. **Dead code / unused imports** (F20, F24, F27, F29, F39, F40, F41, F43, F47, F48): 10 instances across 7 files of unused variables, imports, or computed values.

6. **Timezone-unaware date handling** (F04, F05, F10, F11): Event dates and prayer times are parsed without timezone awareness, causing incorrect display for users in different timezones.
