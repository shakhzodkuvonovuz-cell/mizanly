# M10 — Hostile Audit: Hajj, Scholar, Donation & Community Screens

**Date:** 2026-04-05
**Auditor:** Opus 4.6 (hostile mode)
**Scope:** 12 files across Hajj companion/step, Hifz tracker, Tafsir viewer, Hadith, Fatwa Q&A, Scholar verification, Mentorship, Volunteer board, Waqf, Donate, Charity campaign

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 6 |
| HIGH | 14 |
| MEDIUM | 22 |
| LOW | 15 |
| INFO | 7 |
| **TOTAL** | **64** |

---

## CRITICAL

### C01 — Waqf: Payment recorded before Stripe confirmation (waqf.tsx:62-87)
**File:** `apps/mobile/app/(screens)/waqf.tsx` lines 62-87
**Issue:** `paymentsApi.createPaymentIntent()` returns a PaymentIntent with a `clientSecret` for client-side confirmation, but the code treats a non-null return as "payment succeeded" and immediately calls `api.post('/waqf/funds/.../contribute')`. There is NO actual Stripe confirmation step (`confirmPayment` via `@stripe/stripe-react-native`). The PaymentIntent is in `requires_confirmation` or `requires_payment_method` state — the money has NOT been collected. The backend contribution record is created for a payment that was never completed.
**Impact:** Users get credit for contributions they never paid. Financial fraud vector.

### C02 — Donate: Same fake payment flow (donate.tsx:112-158)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 112-158
**Issue:** Identical to C01. `paymentsApi.createPaymentIntent()` is called, and if a non-null result comes back, the donation is immediately recorded via `donateMutation.mutateAsync()`. No `confirmPayment()` call exists. The PaymentIntent is never confirmed with a payment method.
**Impact:** Donations recorded without actual money transfer. Campaign progress bars inflate with phantom donations.

### C03 — Donate: Custom amount input allows injection of invalid values (donate.tsx:316-323)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 316-323
**Issue:** The custom amount `TextInput` has `onChangeText={setCustomAmount}` with no sanitization. `getAmount()` at line 104 does `parseFloat(customAmount)` which accepts strings like `"0.001"` (fractions of a cent), `"99999999999"` (astronomical amounts), negative via paste, or `"1e308"` (Infinity). There is no minimum amount validation beyond `amount < 100` (cents), no maximum cap, and no decimal place limit.
**Impact:** Users could attempt donations of $0.01 (100 cents minimum, but custom input allows `"0.5"` = 50 cents which passes `< 100` check on line 115), absurdly large amounts causing integer overflow in Stripe, or NaN-like values.

### C04 — Waqf: Custom amount has no maximum cap (waqf.tsx:239-252)
**File:** `apps/mobile/app/(screens)/waqf.tsx` lines 239-252
**Issue:** Custom amount input accepts any decimal number via `parseFloat(customAmount)`. No maximum limit. The amount goes directly to `paymentsApi.createPaymentIntent({ amount: contributionAmount })`. A user could enter `"9999999"` ($9.9M) and the app would attempt to create a Stripe PaymentIntent for that amount. Unlike donate.tsx, the amount here is in **dollars** (not cents), so the minimum check `contributionAmount <= 0` is extremely loose.
**Impact:** Accidental or malicious massive charges. No confirmation dialog for large amounts.

### C05 — Donate: Currency mismatch in campaign progress display (donate.tsx:258-262)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 258-262
**Issue:** `formatAmount(campaign.raisedAmount, currency)` and `formatAmount(campaign.goalAmount, currency)` use the **user's currently selected currency** (which defaults to USD but can be changed to GBP/EUR) to display the campaign's raised/goal amounts. The campaign's amounts are stored in a fixed currency on the backend, but they're being formatted with whatever currency the user picked for their donation. If the user switches to EUR, the campaign shows "EUR 50,000 raised of EUR 100,000" even though the campaign is in USD.
**Impact:** Misleading financial display. Users see wrong currency symbols on campaign data.

### C06 — Waqf: Hardcoded USD for all amounts (waqf.tsx:141, 229)
**File:** `apps/mobile/app/(screens)/waqf.tsx` lines 141, 229
**Issue:** All amounts display `$` prefix (e.g., `$${raised.toLocaleString()}`, `$${amt}`). The currency is hardcoded to USD everywhere. The `paymentsApi.createPaymentIntent` is called with `currency: 'USD'` hardcoded at line 67. No currency selection for waqf contributions. If the backend or fund supports other currencies, the UI will always show `$` and always charge USD.
**Impact:** International users cannot contribute in their local currency. Amounts may be misleading for non-USD funds.

---

## HIGH

### H01 — Hadith: Audio.Sound resource leak on error path (hadith.tsx:141-151)
**File:** `apps/mobile/app/(screens)/hadith.tsx` lines 141-151
**Issue:** `soundRef.current` is cleaned up on unmount, but `handlePlayAudio` is currently a no-op stub. When audio is eventually implemented, if `Audio.Sound.createAsync()` throws mid-creation, the partially-created sound object may not be captured in `soundRef.current` and will leak. The cleanup at line 151 only unloads if `soundRef.current` is set. Also, `Audio` is imported but `isPlaying` state is set but never read in the render tree — dead state.

### H02 — Mentorship: Unhandled promise in onPress handler (mentorship.tsx:222-235)
**File:** `apps/mobile/app/(screens)/mentorship.tsx` lines 222-235
**Issue:** `api.post('/mentorship/request', ...)` is called as a fire-and-forget inside `onPress`. The `.catch()` handler exists, but if the promise rejects and the component has unmounted, `showToast` and `queryClient.invalidateQueries` will be called on an unmounted component. No `isMounted` guard. Also, the promise is not awaited, so rapid taps on different topics could fire multiple concurrent requests.

### H03 — Hifz Tracker: 114 surah objects hardcoded in component file (hifz-tracker.tsx:25-140)
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx` lines 25-140
**Issue:** The entire 114-surah list with Arabic names, transliterations, and ayah counts is hardcoded in the component file. This is ~115 lines of static Islamic data. Per CLAUDE.md: "Islamic data curated by user personally — never AI-generate Quran, hadith, or prayer content." This data should be in a curated data file, not inline in a UI component. Any typo in surah names or ayah counts would be a religious accuracy error.
**Impact:** Hard to audit religious data accuracy. Maintenance burden. Should be in a dedicated data file.

### H04 — Hajj Companion: Division by zero when TOTAL_STEPS is 0 (hajj-companion.tsx:123)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` line 123
**Issue:** `const progressPercent = Math.round((currentStep / TOTAL_STEPS) * 100)`. `TOTAL_STEPS` is hardcoded to 7, but `guide.length` could be anything from the API. The progress bar uses `TOTAL_STEPS` (hardcoded 7) while the step timeline uses `guide.length` (from API). If the API returns 10 steps, the progress bar maxes out at ~143% and the width style `${progressPercent}%` exceeds 100%.

### H05 — Hajj Step: checklistJson parsing without validation (hajj-step.tsx:68)
**File:** `apps/mobile/app/(screens)/hajj-step.tsx` line 68
**Issue:** `JSON.parse(progress.checklistJson || '{}')` — the parsed value is typed as `ChecklistState` but there's no runtime validation that it matches the expected shape `{ [stepIndex: string]: boolean[] }`. If the JSON is corrupted or has unexpected keys (e.g., from a different app version), the code silently uses whatever it gets. The `catch` at line 75 handles parse errors but not shape mismatches.

### H06 — Fatwa Q&A: Unsafe type casting throughout renderQuestion (fatwa-qa.tsx:72-109)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx` lines 72-109
**Issue:** The entire `renderQuestion` function casts `Record<string, unknown>` fields with `as string`, `as Record<string, unknown>`, etc., with zero null checks on the cast results. Line 85: `asker?.displayName as string` — if `displayName` is `undefined`, this renders `undefined` as text. Line 99: `item.question as string` — if `question` is missing, renders `undefined`.
**Impact:** Potential crashes or "undefined" text displayed to users.

### H07 — Mentorship: Displaying raw status string without i18n (mentorship.tsx:115)
**File:** `apps/mobile/app/(screens)/mentorship.tsx` line 115
**Issue:** `{item.status as string}` renders the raw backend status value (e.g., `"active"`, `"pending"`, `"completed"`) directly in the UI without translation. All other text is wrapped in `t()`, but status values are shown raw.

### H08 — Volunteer Board: signUp endpoint does not exist (volunteer-board.tsx:101-111)
**File:** `apps/mobile/app/(screens)/volunteer-board.tsx` lines 101-111 + `api.ts` line 1571-1574
**Issue:** `volunteerApi.signUp(id)` calls `api.post('/volunteer/${id}/signup')` which has a `console.warn` stating "backend endpoint does not exist." The Sign Up button is prominently displayed on every volunteer card but will always fail with a 404. No backend route handles this request.
**Impact:** Sign Up button is completely non-functional. Users will see "Something went wrong" every time.

### H09 — Tafsir Viewer: ScreenErrorBoundary wraps only the success state (tafsir-viewer.tsx:155-292)
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx` lines 110-135, 138-153, 155-292
**Issue:** The `<ScreenErrorBoundary>` wrapper is placed inside the success rendering path (line 156). The loading state (lines 110-135) and error state (lines 138-153) return JSX **without** an error boundary. If a rendering error occurs in the loading or error views, there is no boundary to catch it.

### H10 — Hadith: FlatList with non-unique keys possible (hadith.tsx:339-343)
**File:** `apps/mobile/app/(screens)/hadith.tsx` lines 339-343
**Issue:** `keyExtractor={item => item.id}` — but the daily hadith is prepended to the list at line 180: `setHadiths([dailyHadith, ...listHadiths])`. If the daily hadith also appears in the list response, there will be duplicate `id` keys. FlatList will warn and may exhibit rendering bugs.

### H11 — Donate: `listHeader` useMemo has stale closure over `handleDonate` (donate.tsx:223-365)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 223-365
**Issue:** The `listHeader` `useMemo` includes `handleDonate` in its closure but `handleDonate` is NOT in the dependency array (line 365). The donate button inside `listHeader` captures a stale reference to `handleDonate`. Since `handleDonate` reads `getAmount()`, `isOffline`, `campaignQuery.data`, and `currency` from its own closure, the button may use stale values. The deps array does include some of these individual values (`isCustom`, `selectedAmount`, `currency`, etc.) which partially mitigates this, but `handleDonate` itself is recreated on every render while the memo may not update.

### H12 — Hajj Companion: Alert.alert used for destructive reset confirmation (hajj-companion.tsx:364-371)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` lines 364-371
**Issue:** Per mobile screen rules: "showToast() for mutation feedback, NEVER bare Alert.alert for non-destructive." However, this IS a destructive action (reset progress), so `Alert.alert` is arguably appropriate. BUT the i18n keys used (`hajj.resetConfirmTitle`, `hajj.resetConfirmMessage`) are NOT defined in the i18n file — they rely on `defaultValue` fallback strings. These fallbacks only work in English.

### H13 — Donate: `charity.currencyAmount` i18n key hardcodes `$` symbol (donate.tsx:73, i18n en.json line 2892)
**File:** `apps/mobile/app/(screens)/donate.tsx` line 73 + `en.json` line 2892
**Issue:** The `formatAmount` function at line 45 uses `localeFormatCurrency(cents / 100, currency.toUpperCase())` which properly localizes. BUT the campaign's `formatAmount` at line 73 (inside `CampaignScreenContent`... wait, that's in charity-campaign.tsx) uses `t('charity.currencyAmount', { amount: ... })` which is defined as `"${{amount}}"` — hardcoded dollar sign. When the campaign tracks EUR or GBP, it still shows `$`.

### H14 — Charity Campaign: Division by zero when goalAmount is 0 (charity-campaign.tsx:68-69)
**File:** `apps/mobile/app/(screens)/charity-campaign.tsx` lines 68-69
**Issue:** `campaign.goalAmount > 0` check exists, but `formatAmount(campaign.goalAmount)` on line 159 is called regardless. More critically, if `goalAmount` is 0, `progressPercent` is 0 (guarded), but `formatAmount(0)` returns `"$0"` which displays as "raised of $0" — misleading.

---

## MEDIUM

### M01 — Multiple files: Hardcoded `colors.dark.bg` in StyleSheet.create (hajj-companion.tsx:407, hajj-step.tsx:321, hadith.tsx:436, donate.tsx:425)
**Files:** hajj-companion.tsx:407, hajj-step.tsx:321, hadith.tsx:436, donate.tsx:425
**Issue:** `backgroundColor: colors.dark.bg` is hardcoded in the static `StyleSheet`. While the inline `style` prop overrides this with `tc.bg`, the static stylesheet will flash dark mode colors before the dynamic style applies on first render. Files that use `createStyles(tc)` pattern (tafsir-viewer, scholar-verification, volunteer-board, waqf) avoid this correctly.

### M02 — Hajj Companion: Year picker allows selecting past year (hajj-companion.tsx:383-389)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` lines 383-389
**Issue:** `[currentYear - 1, currentYear, currentYear + 1]` — users can create a Hajj tracker for the previous year. This could be intentional (for retroactive logging), but there's no indication or confirmation that tracking a past Hajj is the intent. Starting a tracker for a past year may confuse users.

### M03 — Hifz Tracker: `stats.percentage` access without type safety (hifz-tracker.tsx:235, 288, 291)
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx` lines 235, 288, 291
**Issue:** `const stats = statsQuery.data as Record<string, number> | undefined;` — then accesses `stats.memorized`, `stats.inProgress`, `stats.needsReview`, `stats.percentage`. If the API response structure changes or any field is missing, these will be `undefined` and render as empty text or cause `NaN` in the progress bar width.

### M04 — Hifz Tracker: `surahMeta` text not fully i18n (hifz-tracker.tsx:186)
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx` line 186
**Issue:** `{surah.ayahs} ayahs \u00b7 {t(STATUS_LABELS[progress.status])}` — the word "ayahs" is hardcoded in English. Should use an i18n key like `t('hifz.ayahCount', { count: surah.ayahs })`.

### M05 — Multiple files: Missing i18n keys relying on defaultValue fallbacks
**Files and keys:**
- hajj-companion.tsx:365 — `hajj.resetConfirmTitle` (defaultValue: 'Reset Progress?')
- hajj-companion.tsx:366 — `hajj.resetConfirmMessage` (defaultValue: 'This will erase...')
- hajj-step.tsx:125 — `hajj.stepCompleted` (defaultValue: 'Step completed!')
- hadith.tsx:147 — `islamic.audioRecitationComingSoon` (defaultValue: 'Audio recitation coming soon')
- donate.tsx:55, 85, 95, 124, 139, 150, 235 — `charity.bannerText`, `charity.paymentFailed`, `charity.noDonationsSubtitle`
- waqf.tsx:55, 73, 84 — `community.waqfPaymentFailed`
- volunteer-board.tsx:105, 143, 225-230, 257, 293-296, 311, 315 — `volunteer.title`, `volunteer.signUp`, `volunteer.signUpSuccess`, `volunteer.filled`, `volunteer.full`, `volunteer.spotsLeft`, `volunteer.empty`, `volunteer.emptySub` (only 6 category keys defined)
**Issue:** These keys exist only as inline `defaultValue` strings. They will show English for all 8 languages. The `volunteer` section in en.json only has 6 category labels — ALL volunteer UI strings are missing.

### M06 — Scholar Verification: Missing `scholar.spec.*` and `scholar.madhab.*` i18n keys (scholar-verification.tsx:351, 369, 416, 434)
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx` lines 351, 369, 416, 434
**Issue:** `t('scholar.spec.${specKey}', specKey)` and `t('scholar.madhab.${madhabKey}', madhabKey)` — the `scholar.spec.fiqh`, `scholar.spec.hadith`, etc. and `scholar.madhab.hanafi`, `scholar.madhab.maliki`, etc. keys do not exist in any i18n file. They fall back to the raw key name (e.g., "fiqh", "hanafi") which is coincidentally acceptable for these Arabic proper nouns, but this is accidental, not intentional localization.

### M07 — Mentorship: `isMentor` logic inverted (mentorship.tsx:101)
**File:** `apps/mobile/app/(screens)/mentorship.tsx` line 101
**Issue:** `const isMentor = !!(item.mentor as Record<string, unknown>);` — this checks if the `mentor` field exists. But the API response for "my mentorships" typically nests the OTHER person. If `item.mentor` exists, it means the current user is the MENTEE (the mentor is the other person). The badge at line 111 shows `isMentor ? t('community.mentee') : t('community.mentor')` which IS correctly inverted, but the variable name `isMentor` is misleading and the overall logic is confusing. If the API shape changes, this breaks silently.

### M08 — Fatwa Q&A: `item.question` should be `item.title` per API (fatwa-qa.tsx:56, 99)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx` lines 56, 99
**Issue:** The mutation at line 56 sends `{ title: question, ... }` to create a question, but the render at line 99 reads `item.question as string`. If the API returns the field as `title` (matching what was sent), the render will show `undefined`. If the API returns `question`, then the mutation field name is wrong. Either way, there's a mismatch.

### M09 — Waqf: `isOffline` check but no offline indicator in UI (waqf.tsx:54)
**File:** `apps/mobile/app/(screens)/waqf.tsx` line 54
**Issue:** `if (isOffline)` shows a toast, but the Contribute button remains enabled and clickable. No visual indicator that the app is offline. Users will keep tapping and getting error toasts.

### M10 — Donate: `isOffline` same issue (donate.tsx:115-116)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 115-116
**Issue:** Same as M09. Donate button stays enabled when offline. The offline check only fires when the button is pressed, giving a poor UX. Button should be disabled when offline.

### M11 — Tafsir Viewer: Double padding on scrollContent (tafsir-viewer.tsx:166)
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx` line 166
**Issue:** `contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing['3xl'] }]}`. The `styles.scrollContent` at line 306 already has `paddingBottom: spacing['3xl']`. The inline style adds another `paddingBottom: insets.bottom + spacing['3xl']`, effectively double-padding the bottom.

### M12 — Hadith: `scrollContent` has `paddingTop: 100` hardcoded (hadith.tsx:444)
**File:** `apps/mobile/app/(screens)/hadith.tsx` line 444
**Issue:** `paddingTop: 100` is a magic number. Should use `insets.top + headerHeight` or similar dynamic value. On devices with large safe area insets (iPhone 14 Pro Max), the header and content may overlap or have excessive gap.

### M13 — Charity Campaign: formatAmount uses `t()` for currency (charity-campaign.tsx:72-74)
**File:** `apps/mobile/app/(screens)/charity-campaign.tsx` lines 72-74
**Issue:** `t('charity.currencyAmount', { amount: (cents / 100).toFixed(0) })` — the i18n key is `"${{amount}}"` which hardcodes the `$` symbol. For campaigns in other currencies, this always shows `$`. The parent donate.tsx uses `localeFormatCurrency` which handles this correctly, but charity-campaign.tsx does not.

### M14 — Volunteer Board: No error state for failed query (volunteer-board.tsx:300-335)
**File:** `apps/mobile/app/(screens)/volunteer-board.tsx` lines 300-335
**Issue:** When `opportunitiesQuery` is loading, a skeleton is shown. When the list is empty, an EmptyState is shown. But there is no explicit error handling for `opportunitiesQuery.isError`. If the query fails, the FlatList renders with `data=[]` and shows the "No opportunities yet" EmptyState, indistinguishable from an actually empty list.

### M15 — Hajj Step: `updateMutation.mutate` called inside setState callback (hajj-step.tsx:94-116)
**File:** `apps/mobile/app/(screens)/hajj-step.tsx` lines 94-116
**Issue:** `toggleCheckItem` calls `updateMutation.mutate()` inside a `setChecklistState` updater callback. Mutations that trigger state updates should not be called from within state updater functions, as this can cause React to batch incorrectly. The mutation side effect should happen after the state update.

### M16 — Scholar Verification: No file size or type validation (scholar-verification.tsx:170-177)
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx` lines 170-177
**Issue:** `handleAddDocument` is a stub showing a toast. When implemented, there's no validation logic prepared for file size limits, file type restrictions (PDF/images only), or max document count. The code allows unlimited documents via `setDocumentUrls(prev => prev.filter(...))` pattern, but no maximum is enforced on the add side.

### M17 — Fatwa Q&A: No debounce on refetch (fatwa-qa.tsx:160-161)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx` lines 160-161
**Issue:** `onRefresh={() => questionsQuery.refetch()}` — pull-to-refresh calls refetch directly. Combined with `onEndReached` pagination, rapid pulls could trigger multiple concurrent fetches. React Query handles this internally to some degree, but there's no explicit guard.

### M18 — Mentorship: `doubleTapRef` timeout uses `setTimeout` without cleanup (mentorship.tsx:80-81)
**File:** `apps/mobile/app/(screens)/mentorship.tsx` lines 80-81
**Issue:** `setTimeout(() => { doubleTapRef.current = false; }, 500);` — this timeout is not cleaned up on unmount. If the user navigates away within 500ms, the callback fires on an unmounted component. While it only sets a ref (no state), it's still a pattern violation.

### M19 — Hajj Companion: `handleShare` error silently swallowed (hajj-companion.tsx:134-137)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` lines 134-137
**Issue:** `catch { // ignore }` — all share errors are silently swallowed, including non-cancellation errors. `Share.share()` can throw for reasons other than user cancellation (e.g., invalid message content, platform errors).

### M20 — Hifz Tracker: No ScreenErrorBoundary at top level (hifz-tracker.tsx:320-371)
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx` lines 320-371
**Issue:** The component wraps itself in `<ScreenErrorBoundary>` at line 321, but `HifzTrackerScreen` is a default export function, not a wrapper. The `<ScreenErrorBoundary>` is inside the function body alongside `<SafeAreaView>`. If code BEFORE the return statement throws (e.g., in `useQuery` hooks, `useMemo`), the error boundary cannot catch it because React error boundaries only catch errors in the render tree below them, not in hooks.

### M21 — Donate: `colors.dark.bgCard`, `colors.dark.surface`, `colors.dark.border` in static StyleSheet (donate.tsx:460, 480, 506, etc.)
**File:** `apps/mobile/app/(screens)/donate.tsx` — multiple lines in static StyleSheet (460, 480, 505-506, 565-566, 589)
**Issue:** Many style properties reference `colors.dark.*` directly in the static StyleSheet. While inline styles override with `tc.*` for some properties (e.g., `donationItem` at line 205), others like `campaignCard` (line 460), `progressBarBg` (line 480), `amountChip` (line 500-506), `currencyPill` (line 565-566), `donationItem` (line 589) hardcode dark-mode colors. In light mode, these will show dark backgrounds.

### M22 — Waqf: No confirmation dialog before large contributions (waqf.tsx:52-88)
**File:** `apps/mobile/app/(screens)/waqf.tsx` lines 52-88
**Issue:** There is no confirmation step before processing a contribution. A user selects $500, taps Contribute, and the payment is immediately initiated. For financial actions of this magnitude, a confirmation dialog ("Are you sure you want to contribute $500?") is a standard safety measure.

---

## LOW

### L01 — Hajj Companion: `colors.error` used without import check (hajj-companion.tsx:361)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` line 361
**Issue:** `color={colors.error}` — `colors.error` is defined in the theme, so this works. However, the destructive BottomSheetItem uses `colors.error` directly instead of `tc.error` (if it existed). Minor theme inconsistency, not a bug.

### L02 — Tafsir Viewer: `shareGuardRef` timeout of 500ms may be too short (tafsir-viewer.tsx:101)
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx` line 101
**Issue:** `setTimeout(() => { shareGuardRef.current = false; }, 500);` — on slow devices, the Share dialog might not fully dismiss within 500ms, potentially allowing a second share tap.

### L03 — Hadith: `bookmarkGuard` race condition (hadith.tsx:198-230)
**File:** `apps/mobile/app/(screens)/hadith.tsx` lines 198-230
**Issue:** `bookmarkGuard.current` is set to `true` synchronously, then reset in `.finally()`. The optimistic UI update happens immediately, but if the user switches to a different hadith before the API responds, the revert logic at lines 220-226 will try to revert state for the wrong hadith (since `currentHadith` may have changed). The `hadithId` capture at line 203 helps, but `setCurrentHadith(prev => ...)` at line 220 blindly toggles back regardless of whether the current hadith is still the same one.

### L04 — Hifz Tracker: `progressQuery.isRefetching` only shows for first query refresh (hifz-tracker.tsx:338)
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx` line 338
**Issue:** `refreshing={progressQuery.isRefetching}` — only tracks the progress query's refetch state. If `statsQuery` or `reviewQuery` are still fetching after `progressQuery` completes, the refresh control stops spinning prematurely.

### L05 — Hajj Step: `step.checklist.map(() => false)` crashes if checklist is undefined (hajj-step.tsx:73, 76)
**File:** `apps/mobile/app/(screens)/hajj-step.tsx` lines 73, 76
**Issue:** `step.checklist.map(() => false)` — if the API returns a step without a `checklist` array, this will throw `Cannot read properties of undefined (reading 'map')`. Same risk at line 76 in the catch block. No null check on `step.checklist`.

### L06 — Fatwa Q&A: `onEndReached` fires without debounce (fatwa-qa.tsx:162)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx` line 162
**Issue:** `onEndReached={() => questionsQuery.hasNextPage && questionsQuery.fetchNextPage()}` — no `onEndReachedThreshold` is set, defaulting to 0.5. Combined with no loading indicator for pagination, rapid scrolling could trigger multiple fetch calls.

### L07 — Charity Campaign: `handleShare` message hardcodes domain (charity-campaign.tsx:60)
**File:** `apps/mobile/app/(screens)/charity-campaign.tsx` line 60
**Issue:** `message: '...https://mizanly.app/charity/${campaign.id}'` — the domain and URL path are hardcoded. Should use a config constant or deep link utility.

### L08 — Hadith: `Share.share` message hardcodes "Shared from Mizanly" (hadith.tsx:241)
**File:** `apps/mobile/app/(screens)/hadith.tsx` line 241
**Issue:** The string `"Shared from Mizanly"` is hardcoded in English, not wrapped in `t()`.

### L09 — Waqf: `contributionAmount` can be `NaN` (waqf.tsx:42)
**File:** `apps/mobile/app/(screens)/waqf.tsx` line 42
**Issue:** `const contributionAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;` — the `|| 0` fallback handles NaN from `parseFloat("")`, but `parseFloat(".")` returns `NaN` which is caught by `|| 0`. However, `parseFloat("1.")` returns `1` which is valid. Edge case: `parseFloat("1.2.3")` returns `1.2` silently. The `onChangeText` sanitizer at line 248 prevents double dots, but pasting could bypass it.

### L10 — Hajj Companion: Unused imports (hajj-companion.tsx:1)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx` line 1
**Issue:** `useEffect` is imported but only used in `PulseCircle` (child component). `useMemo` is imported and used. `useCallback` is imported and used. `navigate` imported at line 25 is used. `useRouter` imported at line 5 is unused (the screen uses `navigate()` utility instead, and `router` is declared at line 58 but never used — only `navigate` is called at line 269).

### L11 — Mentorship: `user` from store is read but never used (mentorship.tsx:39)
**File:** `apps/mobile/app/(screens)/mentorship.tsx` line 39
**Issue:** `const user = useStore(s => s.user);` — `user` is never referenced anywhere in the component. Dead import causing unnecessary re-renders when user state changes.

### L12 — Tafsir Viewer: `language` used for text selection but not for Arabic font (tafsir-viewer.tsx:247)
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx` line 247
**Issue:** `{language === 'ar' ? source.textAr : source.textEn}` — when `language` is Arabic, Arabic text is shown. But when language is Turkish, Urdu, Bengali, French, Indonesian, or Malay, English text is shown. No support for other translated tafsir languages.

### L13 — Donate: `showSuccess` state resets on remount, not on navigation (donate.tsx:67, 176-202)
**File:** `apps/mobile/app/(screens)/donate.tsx` lines 67, 176-202
**Issue:** After donation success, `showSuccess` is set to `true` showing a success screen. If the user presses the hardware back button (Android) instead of the "Done" button, the screen pops. If they navigate back to donate, `showSuccess` starts as `false` (fresh state), which is correct. However, if the component doesn't remount (e.g., Expo Router keeps it in memory), the success screen would persist.

### L14 — Fatwa Q&A: `questionsQuery` endpoint is `/scholar-qa/upcoming` (fatwa-qa.tsx:47)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx` line 47
**Issue:** The screen is "Fatwa Q&A" but queries `/scholar-qa/upcoming`. The term "upcoming" suggests scheduled Q&A sessions, not a browsable fatwa archive. If this is the wrong endpoint, the data displayed would be incorrect.

### L15 — Multiple files: `as never` type assertion for router.push pathname (charity-campaign.tsx:49)
**File:** `apps/mobile/app/(screens)/charity-campaign.tsx` line 49
**Issue:** `pathname: '/(screens)/donate' as never` — the `as never` cast suppresses type checking on the route path. If the route is renamed or removed, TypeScript will not catch the error.

---

## INFO

### I01 — Waqf + Donate: Payment flow is incomplete without `@stripe/stripe-react-native`
Both waqf.tsx and donate.tsx call `paymentsApi.createPaymentIntent()` but never call `confirmPayment()`. The Stripe React Native SDK is needed to actually collect payment. This is likely a known limitation (no EAS build yet), but the current code path records contributions/donations without actual payment.

### I02 — Scholar Verification: Document upload is a stub
`handleAddDocument` at line 170 shows a toast saying upload requires file picker. This is acknowledged in the code comments. The submit button is disabled when `documentUrls.length === 0`, so the form cannot be submitted without documents — effectively making the entire screen non-functional until the dependency is added.

### I03 — Hadith: Audio playback is a stub
`handlePlayAudio` at line 144 shows a "coming soon" toast. The `Audio` import from `expo-av` and `soundRef` are dead code until this is implemented.

### I04 — Volunteer Board: All non-category i18n keys use defaultValue fallbacks
The `volunteer` section in en.json only contains 6 category translation keys. All other strings (title, signUp, signUpSuccess, filled, full, spotsLeft, empty, emptySub) use inline `defaultValue` and will show English for all 8 languages.

### I05 — Hifz Tracker: No offline caching for surah progress
The hifz tracker queries the API for progress on every mount. For a memorization tracker (which users check frequently, possibly without connectivity), there's no offline persistence of the surah progress map. A user on a plane reviewing their Quran cannot check their progress.

### I06 — All financial screens: No receipt generation or email confirmation
Donate, waqf, and charity campaign screens process (or attempt to process) financial transactions but provide no receipt, email confirmation, or transaction reference number. For tax-deductible charitable donations, this is a compliance concern.

### I07 — Hajj screens: No offline support for step guide data
The Hajj guide data is fetched from the API. Users performing Hajj are often in areas with poor connectivity (Mina, Arafat). The guide data has a 5-minute stale time but no persistent cache. If the app is killed and reopened without connectivity, users see a loading screen indefinitely.
