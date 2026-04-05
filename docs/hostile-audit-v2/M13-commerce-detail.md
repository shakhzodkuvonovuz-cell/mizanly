# M13 Hostile Audit: Commerce & Detail Screens

**Scope:** 10 files in `apps/mobile/app/(screens)/`
**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05

---

## CRITICAL

### C01 — Navigation param key mismatch: storefront -> product detail (creator-storefront.tsx:125 / product-detail.tsx:105)
- **File:** `creator-storefront.tsx` line 125, `product-detail.tsx` line 105
- **Issue:** `creator-storefront.tsx` navigates with `{ productId }` but `product-detail.tsx` reads `params.id`. The param key mismatch means `params.id` will be `undefined` when arriving from the storefront, causing the product query to never fire and showing "Product not found".
- **Evidence:**
  - `creator-storefront.tsx:125`: `navigate('/(screens)/product-detail', { productId });`
  - `product-detail.tsx:105`: `const params = useLocalSearchParams<{ id: string }>();`
- **Severity:** Critical -- complete navigation break.

### C02 — Price unit inconsistency: cents vs dollars (product-detail.tsx:324 vs creator-storefront.tsx:171)
- **File:** `product-detail.tsx` lines 167, 177, 324; `creator-storefront.tsx` line 171
- **Issue:** `product-detail.tsx` divides price by 100 (`product.price / 100`), treating it as cents. `creator-storefront.tsx` displays `item.price.toFixed(2)` without division, treating it as dollars. Both render the same conceptual `price` field. One screen will show 100x the correct price or 1/100th.
- **Evidence:**
  - `product-detail.tsx:324`: `${(product.price / 100).toFixed(2)}`
  - `creator-storefront.tsx:171`: `{item.currency}{item.price.toFixed(2)}`
- **Severity:** Critical -- money display error.

### C03 — Membership tier creation sends float price directly, no cents conversion (membership-tiers.tsx:240-255)
- **File:** `membership-tiers.tsx` lines 240-255
- **Issue:** `handleCreateTier` sends `price` as `parseFloat(newTierPrice)` directly. If the API expects cents (as product-detail.tsx implies), this is wrong. If the API expects dollars, product-detail.tsx is wrong. Either way, there is no consistent convention and no validation for max price, decimal places, or currency.
- **Evidence:** Line 249: `price,` (raw float from user input)
- **Severity:** Critical -- money integrity issue.

---

## HIGH

### H01 — Stale closure + infinite loop risk in fetchStorefront (creator-storefront.tsx:91, 99)
- **File:** `creator-storefront.tsx` lines 91, 99
- **Issue:** `fetchStorefront` useCallback has `products.length` in its dependency array (line 99). Inside the catch block (line 91), it references `products.length` from the closure. Every successful fetch updates `products`, changing `products.length`, which recreates `fetchStorefront`, which triggers `useFocusEffect` (line 106-112) to re-run, which calls `fetchStorefront(true)` again. This creates an infinite fetch loop on every focus event after data loads.
- **Severity:** High -- infinite network requests on focus.

### H02 — No error state for post-insights (post-insights.tsx:130-133)
- **File:** `post-insights.tsx` lines 130-133
- **Issue:** When `loadData` catches an error, it sets `insights = null` and shows a toast, but there is no dedicated error UI. After loading completes, the screen shows nothing (no insights cards render when `insights` is null) with no retry button, no error message, no way for the user to recover other than pull-to-refresh.
- **Severity:** High -- dead-end screen on API failure.

### H03 — boost-post budget accepts non-numeric and negative custom input (boost-post.tsx:178-179)
- **File:** `boost-post.tsx` lines 178-179
- **Issue:** Custom budget input uses `keyboardType="number-pad"` but `onChangeText` directly sets the string with no sanitization. `parseInt(customBudget, 10)` on line 52 will parse leading digits and ignore trailing non-numeric chars. More critically, there is no upper bound validation -- a user could enter "99999" and submit a $99,999 boost. The API call fires with whatever `activeBudget` is.
- **Evidence:** Line 52: `parseInt(customBudget, 10) || 0` -- allows 0 as parsed value for garbage input.
- **Severity:** High -- payment amount unbounded.

### H04 — enable-tips handleSave never persists to server (enable-tips.tsx:131-139)
- **File:** `enable-tips.tsx` lines 131-139
- **Issue:** `handleSave` only shows a toast saying "saved locally". None of the tip configuration state (minTipAmount, displaySettings, thankYouMessage) is ever persisted anywhere -- not to AsyncStorage, MMKV, or the API. If the user leaves the screen, all settings are lost. The `submitting` state variable exists but `handleSave` never sets it, so the disabled check on the save button (line 467) is always false.
- **Severity:** High -- feature is non-functional (save does nothing).

### H05 — appeal-moderation submits with empty reportId (appeal-moderation.tsx:87-88)
- **File:** `appeal-moderation.tsx` lines 87-88
- **Issue:** If `reportId` is undefined (user navigates directly), `submitAppealMutation` sends `reportId: ''` (empty string) to the API. There is no early guard that prevents the form from rendering when `reportId` is missing, unlike other screens (branded-content, boost-post) which show an EmptyState.
- **Evidence:** Line 88: `reportId: reportId || ''`
- **Severity:** High -- submitting invalid data to API.

---

## MEDIUM

### M01 — Module-scope Dimensions.get breaks iPad rotation (product-detail.tsx:37, membership-tiers.tsx:35)
- **Files:** `product-detail.tsx` line 37, `membership-tiers.tsx` line 35
- **Issue:** Both files use `const { width } = Dimensions.get('window')` at module scope. This value is captured once at import time and never updates on device rotation or iPad multitasking window resize. `creator-storefront.tsx` correctly uses `useWindowDimensions()` hook (line 63) -- the others should do the same.
- **Note:** `membership-tiers.tsx` imports `width` at line 35 but never uses it at all (dead code).
- **Severity:** Medium -- broken layout on iPad rotation.

### M02 — Static styles bypass theme in 5 files (multiple locations)
- **Files:**
  - `creator-storefront.tsx`: lines 328, 371, 374, 401, 404, 409 (6 occurrences of `colors.dark.*`)
  - `cross-post.tsx`: lines 283, 296, 306, 332, 334, 346, 369, 385, 401, 403 (10 occurrences)
  - `enable-tips.tsx`: lines 493, 539, 650 (3 occurrences)
  - `collab-requests.tsx`: line 383 (`colors.dark.border`)
  - `membership-tiers.tsx`: lines 512, 519, 550, 584, 598, 614, 629, 642, 655, 665, 672, 678, 700, 713, 738, 754, 759 (17 occurrences of `colors.text.*`)
  - `enable-tips.tsx`: lines 521, 527, 544, 556, 585, 601, 604, 618, 625, 640, 646, 663, 678, 701, 726 (15 occurrences)
  - `cross-post.tsx`: lines 312, 318, 323, 354, 359, 389 (6 occurrences)
  - `creator-storefront.tsx`: lines 357, 362, 367, 385, 390, 445, 454 (7 occurrences)
- **Issue:** These files use `colors.dark.*` or `colors.text.*` directly in `StyleSheet.create()` instead of using the `tc.*` theme tokens from `useThemeColors()`. This means styles won't adapt to theme changes (if light mode is ever added) and are inconsistent with the dynamic styles used inline via `{ color: tc.text.primary }`.
- **Severity:** Medium -- broken theme support in production.

### M03 — RTL layout not handled in 4 files (boost-post.tsx, branded-content.tsx, collab-requests.tsx, appeal-moderation.tsx)
- **Files:**
  - `boost-post.tsx`: No RTL import or usage. All `flexDirection: 'row'` in styles are static.
  - `branded-content.tsx`: No RTL import or usage.
  - `collab-requests.tsx`: 6 hardcoded `flexDirection: 'row'` (lines 358, 363, 371, 374, 388, 393). No `rtlFlexRow` calls.
  - `appeal-moderation.tsx`: No RTL import or usage. Multiple `flexDirection: 'row'` in styles.
- **Issue:** Arabic and Urdu users (2 of the 8 supported languages) will see reversed layouts in these screens. Other files in scope (cross-post, membership-tiers, post-insights) correctly use `rtlFlexRow(isRTL)`.
- **Severity:** Medium -- broken RTL for 25% of target languages.

### M04 — Raw RN Switch used instead of custom toggle (branded-content.tsx:109)
- **File:** `branded-content.tsx` line 9, 109
- **Issue:** Uses raw `import { Switch } from 'react-native'` instead of the custom toggle pattern used in `enable-tips.tsx` (CustomToggle component with LinearGradient). This creates visual inconsistency. The RN Switch also has platform-specific appearance differences.
- **Severity:** Medium -- design inconsistency.

### M05 — Alert.alert used for destructive confirmations (collab-requests.tsx:97, 109, 121)
- **File:** `collab-requests.tsx` lines 97, 109, 121
- **Issue:** Uses `Alert.alert()` for accept/decline/remove confirmations. Per project rules: "showToast() for mutation feedback, NEVER bare Alert.alert for non-destructive". While these are destructive actions (where Alert.alert is acceptable), the UI should use a BottomSheet for consistency with the rest of the app. The `Alert.alert` also doesn't match the dark theme.
- **Severity:** Medium -- design inconsistency (borderline, since these ARE destructive).

### M06 — Hardcoded `'#fff'` and `'#FFF'` colors (product-detail.tsx:534, collab-requests.tsx:400, enable-tips.tsx:474)
- **Files:**
  - `product-detail.tsx:534`: `backgroundColor: '#fff'` in dot active style
  - `collab-requests.tsx:400`: `color: '#fff'` in action button text
  - `enable-tips.tsx:474`: `color: '#fff'` in save button text
- **Issue:** Hardcoded white color bypasses theme tokens. Should use `colors.text.onColor` or `tc.text.primary` as appropriate.
- **Severity:** Medium -- won't adapt to themes.

### M07 — Unused imports (enable-tips.tsx:24, membership-tiers.tsx:35)
- **Files:**
  - `enable-tips.tsx:24`: `import { settingsApi } from '@/services/api'` -- never used anywhere in the file.
  - `membership-tiers.tsx:35`: `const { width } = Dimensions.get('window')` -- `width` variable never referenced.
- **Severity:** Medium -- dead code, increases bundle slightly.

### M08 — No keyboard dismiss on scroll (enable-tips.tsx, membership-tiers.tsx, boost-post.tsx, branded-content.tsx)
- **Files:** `enable-tips.tsx`, `membership-tiers.tsx`, `boost-post.tsx`, `branded-content.tsx`
- **Issue:** These screens have TextInput fields but their ScrollView/FlatList does not set `keyboardDismissMode="on-drag"`. Users must tap outside the input to dismiss the keyboard, which is poor UX on mobile.
- **Severity:** Medium -- UX friction.

---

## LOW

### L01 — Missing accessibilityLabel on back button in enable-tips.tsx (lines 156, 172, 194)
- **File:** `enable-tips.tsx` lines 156, 172, 194
- **Issue:** The `GlassHeader` leftAction in loading, error, and main states all omit `accessibilityLabel`. Other files in scope correctly include `accessibilityLabel: t('common.back')`.
- **Severity:** Low -- accessibility regression.

### L02 — Date formatted with default locale instead of user locale (collab-requests.tsx:222, product-detail.tsx:432)
- **Files:**
  - `collab-requests.tsx:222`: `new Date(post.createdAt).toLocaleDateString()` -- uses browser default locale
  - `product-detail.tsx:432`: `new Date(review.createdAt).toLocaleDateString()` -- same
- **Issue:** Should use the `formatDate` utility from `@/utils/localeFormat` (which `appeal-moderation.tsx` correctly imports and uses) to ensure consistent locale-aware date formatting across the app.
- **Severity:** Low -- inconsistent formatting.

### L03 — accessibilityLabel in product-detail uses hardcoded $ sign (product-detail.tsx:167)
- **File:** `product-detail.tsx` line 167
- **Issue:** `accessibilityLabel={\`${item.title}, $${(item.price / 100).toFixed(2)}\`}` hardcodes `$` regardless of `currency` field. If a product uses EUR, GBP, etc., VoiceOver will read the wrong currency symbol.
- **Severity:** Low -- accessibility + i18n.

### L04 — boost-post.tsx custom budget strips all non-digits including decimals (boost-post.tsx:317 in enable-tips, boost has maxLength but no decimal)
- **File:** `enable-tips.tsx` line 317
- **Issue:** The custom tip amount uses `text.replace(/[^0-9]/g, '')` which strips decimal points. This means the user can only enter whole dollar amounts. The preset amounts are `[1, 2, 5, 10]` -- all whole numbers -- so this may be intentional, but it's undocumented and inconsistent with membership-tiers.tsx which allows decimal prices.
- **Severity:** Low -- UX inconsistency.

### L05 — product-detail.tsx star rendering doesn't handle half stars (product-detail.tsx:82-96)
- **File:** `product-detail.tsx` lines 82-96
- **Issue:** `renderStars` uses `Math.floor(rating)` and only renders full or empty stars. A product with rating 4.7 shows 4 filled stars, the same as 4.1. Users see misleading ratings. Should show half-star or partial fill for non-integer ratings.
- **Severity:** Low -- misleading UI.

### L06 — FlatList inside ScrollView in product-detail.tsx (product-detail.tsx:469-477)
- **File:** `product-detail.tsx` lines 469-477
- **Issue:** A horizontal `FlatList` (related products) is nested inside a `ScrollView`. While horizontal FlatLists inside vertical ScrollViews generally work, this can cause issues with scroll gesture detection on some devices. The outer ScrollView should be a FlatList with sections, or the inner FlatList should use `nestedScrollEnabled`.
- **Severity:** Low -- potential gesture conflict.

### L07 — Missing loading/submitting indicator for tier toggle (membership-tiers.tsx:205-221)
- **File:** `membership-tiers.tsx` lines 205-221
- **Issue:** `toggleTier` does an optimistic update then calls `fetchData()`, but there is no visual indicator that the server call is in progress. If the API is slow, the user can toggle rapidly, creating a race condition where multiple toggle requests are in flight.
- **Severity:** Low -- race condition on rapid toggles.

### L08 — appeal-moderation.tsx uses `GlassHeader onBack` prop instead of `leftAction` (appeal-moderation.tsx:157)
- **File:** `appeal-moderation.tsx` line 157
- **Issue:** Uses `onBack={() => router.back()}` while every other file in scope uses `leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}`. While `onBack` is supported by GlassHeader (verified in source), it has different behavior (auto-creates a leftAction internally). The inconsistency is minor but the `onBack` version has no `accessibilityLabel` for the generated button.
- **Severity:** Low -- inconsistent pattern, accessibility gap.

### L09 — No maximum tier count enforced (membership-tiers.tsx)
- **File:** `membership-tiers.tsx` (entire file)
- **Issue:** Users can create unlimited membership tiers. There is no limit on how many tiers can be created. Most platforms cap at 3-5 tiers. The UI will degrade with many tiers as animation delays scale linearly (line 76: `FadeInUp.delay(Math.min(index, 15) * 100)`).
- **Severity:** Low -- UX degradation at scale.

### L10 — boost-post.tsx doesn't validate currency or show currency symbol from post (boost-post.tsx)
- **File:** `boost-post.tsx` (entire file)
- **Issue:** All monetary displays hardcode `$` (lines 155, 166, 255, 265). There is no currency parameter sent to the API. If the user is in a non-USD region or the post targets a different market, the boost budget is in ambiguous currency.
- **Severity:** Low -- currency assumption.

### L11 — cross-post.tsx missing error state for fetch failure (cross-post.tsx:107-127)
- **File:** `cross-post.tsx` lines 107-127
- **Issue:** The loading state shows skeletons, and `!post` shows "Not Found" EmptyState. But `postQuery.isError` is never checked explicitly. If the API returns an error, `post` will be null, and the user sees "Not Found" instead of "Something went wrong" with a retry button. This conflates "not found" with "network error".
- **Severity:** Low -- misleading error message.

### L12 — product-detail.tsx related product price hardcodes $ sign (product-detail.tsx:177)
- **File:** `product-detail.tsx` line 177
- **Issue:** `<Text style={styles.relatedPrice}>${(item.price / 100).toFixed(2)}</Text>` hardcodes `$`. The `ProductDetail.currency` field exists but is not used for related products. The related product type doesn't even include a `currency` field.
- **Severity:** Low -- currency not parameterized.

---

## INFO

### I01 — enable-tips.tsx fetchData missing `t` in dependency array (enable-tips.tsx:116)
- **File:** `enable-tips.tsx` line 116
- **Issue:** `fetchData` useCallback has empty dependency array `[]` but references `t` inside (line 111). If the language changes while on this screen, the error message will be in the old language. Minor since language changes rarely happen mid-session.

### I02 — collab-requests.tsx ScreenErrorBoundary only wraps the non-error path (collab-requests.tsx:279-295 vs 297-348)
- **File:** `collab-requests.tsx` lines 279-295
- **Issue:** The error state (lines 279-295) renders outside `ScreenErrorBoundary`. If the error UI itself throws (unlikely but possible), it won't be caught.

### I03 — creator-storefront.tsx price display doesn't account for zero-decimal currencies (creator-storefront.tsx:171)
- **File:** `creator-storefront.tsx` line 171
- **Issue:** `{item.currency}{item.price.toFixed(2)}` always shows 2 decimal places. Some currencies (JPY, KRW) don't use decimals. Should use `formatCurrency` from `@/utils/localeFormat` like membership-tiers does.

### I04 — appeal-moderation.tsx evidence image picker silently swallows errors (appeal-moderation.tsx:327)
- **File:** `appeal-moderation.tsx` line 327
- **Issue:** The catch block for `ImagePicker.launchImageLibraryAsync` is empty (`catch { // Image picker not available }`). If the picker fails for permissions reasons, the user gets no feedback.

### I05 — membership-tiers.tsx new tier always defaults to 'bronze' level (membership-tiers.tsx:253)
- **File:** `membership-tiers.tsx` line 253
- **Issue:** `level: 'bronze'` is hardcoded. Users cannot choose silver/gold/platinum when creating a tier. The TIER_COLORS map supports all 4 levels but only bronze can be created from the UI.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 8 |
| Low | 12 |
| Info | 5 |
| **Total** | **33** |

### Top 3 Fixes by Impact
1. **C01** -- Fix param key: either change storefront to `{ id: productId }` or product-detail to read `params.productId`. Navigation is completely broken.
2. **C02/C03** -- Standardize price unit convention (cents vs dollars) across all commerce screens and API calls.
3. **H01** -- Remove `products.length` from `fetchStorefront` dependency array; use a ref or move the check outside the callback.
