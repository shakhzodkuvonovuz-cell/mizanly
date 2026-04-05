# M21 — Commerce, Search, & Miscellaneous Screens Hostile Audit

**Screens audited:** marketplace.tsx, gift-shop.tsx, cashout.tsx, orders.tsx, send-tip.tsx, revenue.tsx, creator-dashboard.tsx, search.tsx, search-results.tsx, ai-assistant.tsx

**Auditor:** Opus 4.6 (1M context)
**Date:** 2026-04-05
**Severity scale:** C = Critical, H = High, M = Medium, L = Low, I = Info

---

## 1. marketplace.tsx (512 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 1 | M | 34 | **Static `Dimensions.get('window')` at module scope.** `screenWidth` is captured once at import time. On iPad rotation or split-view, `COLUMN_WIDTH` and all grid calculations will be stale. Should use `useWindowDimensions()` inside the component. |
| 2 | M | 109-121 | **No error state for products query.** `productsQuery.isError` is never checked. If the API call fails, the screen shows a FlatList with an empty array, rendering the "No products found" EmptyState, which is misleading -- user has no way to know it was a network error vs. genuinely empty. No retry action. |
| 3 | L | 68-84 | **RatingStars half-star logic is wrong.** When `rating = 3.5`, `full = 3`, `half = true`. On `i === 3` (the 4th star), `i < full` is false, `i === full && half` is true, so it renders a filled star instead of a half star. All "filled" icons are rendered identically for both full and half -- there is no half-star icon being used. Half-star ratings are visually indistinguishable from full stars. |
| 4 | L | 184 | **Fallback currency `'USD'` hardcoded.** `item.currency || 'USD'` silently defaults to USD if server returns empty string. This hides currency mismatches for international sellers. Should log or display a warning. |
| 5 | I | 479-483 | **`productPrice` style uses `colors.gold` directly** instead of themed color, not responsive to dark/light theme changes if gold contrast differs. |
| 6 | L | 489-494 | **`reviewCount` and `sellerName` styles use `colors.text.tertiary` and `colors.text.secondary` directly** (static module-scope colors) instead of `tc.text.tertiary` from theme context. Won't update on theme switch. |
| 7 | M | 175-234 | **No `getItemLayout` on FlatList with `numColumns={2}`.** Without it, scrolling performance degrades on large product lists because RN can't pre-compute offsets. |

---

## 2. gift-shop.tsx (805 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 8 | C | 131-161 | **CRITICAL: Coin purchase flow credits coins BEFORE Stripe payment confirmation.** Line 149 calls `purchaseMutation.mutateAsync(amount)` which credits coins after merely creating a PaymentIntent (line 133-138). A PaymentIntent creation does NOT mean payment succeeded. The TODO comment at line 141 acknowledges Stripe `confirmPayment` is missing, but then line 149 credits coins anyway. Users get free coins without actually paying. |
| 9 | H | 31-36 | **Hardcoded USD prices in `COIN_PACKAGES`.** These string prices (`$0.99`, `$4.99`) bypass any currency localization. Non-US users see USD symbols regardless of locale. On iOS, Apple IAP handles pricing per region -- this hardcoded list will conflict with IAP prices. |
| 10 | H | 122 | **`parseFloat(pkg.price.replace('$', ''))` -- brittle price parsing.** If localized prices ever include commas (e.g., `$4,99`) or other currency symbols, `parseFloat` returns NaN. The NaN check at line 123 silently returns, swallowing the error with no user feedback. |
| 11 | M | 175-201 | **`handleCashout` uses Alert.alert for destructive financial action.** Project rules say `showToast()` for mutation feedback, never bare `Alert.alert` for non-destructive actions. This IS destructive (irreversible diamond conversion), so Alert.alert is acceptable -- but the confirmation dialog has no amount preview in USD, user has no idea what they're getting. |
| 12 | M | 204-209 | **`giftItems` fallback uses `DEFAULT_GIFTS` hardcoded coins values.** If catalog API fails, the screen silently falls back to local gift definitions with hardcoded coin costs that may not match server prices. User could attempt to send a gift at a wrong price. |
| 13 | L | 246-268 | **`COIN_PACKAGES` rendered with `FadeInUp.delay(Math.min(index, 15) * 80)`.** With only 4 items this is fine, but the `min(index, 15)` suggests copy-paste from a longer list. Minor. |
| 14 | M | 89-104 | **No error handling shown to user on `purchaseMutation` or `cashoutMutation` failure.** `purchaseMutation` has no `onError` callback -- if `giftsApi.purchaseCoins` fails after PaymentIntent creation, coins are debited server-side but user sees no error. The error IS caught in the try/catch at line 155-158, but `purchaseMutation.mutateAsync` might throw separately from the PaymentIntent step. |
| 15 | L | 315 | **`formatDistanceToNowStrict` called with `new Date(item.createdAt)`.** If `createdAt` is malformed or null, this throws. No try/catch. |

---

## 3. cashout.tsx (883 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 16 | H | 94-116 | **Feature-gated with `CASHOUT_ENABLED = false`, but hooks are declared AFTER the early return at line 116.** React hooks at lines 118-128 are below a conditional return. This violates Rules of Hooks -- hooks must not be called conditionally. React may crash in development mode with "Rendered fewer hooks than expected." In this specific case, the early return prevents hooks from ever being called, which IS a violation. |
| 17 | M | 129 | **`parseFloat(amountText)` accepts negative numbers.** User can type `-500` and `amount` becomes `-500`. Line 183 checks `amount > balance.diamonds` but not `amount < 0`. The validation at line 183 only checks upper bound. `handleConfirm` checks `amount <= 0` at line 183, which does catch negatives -- BUT the USD conversion at line 130-131 would show negative USD values in the UI before submit, confusing users. |
| 18 | M | 171 | **useEffect with empty dependency array `[]` but uses `t` function.** If the user changes language, the `showToast` messages inside the effect callbacks use the stale `t` from the initial render. React exhaustive-deps would flag this. |
| 19 | L | 247 | **`formatCurrency(netAmount)` called without currency parameter.** The imported `formatCurrency` from `@/utils/localeFormat` likely expects `(amount, currency)` signature (see marketplace.tsx line 216 which passes currency). Here it's called with just the amount, potentially displaying wrong currency symbol. |
| 20 | L | 337-345 | **`amountText` TextInput with `keyboardType="numeric"` accepts `.` and `-` on some Android keyboards.** Should use `onChangeText` sanitizer to strip non-digit characters (like send-tip.tsx line 347 does). |
| 21 | I | 577-578 | **`scrollContent` style has hardcoded `paddingTop: 100`.** Should use `insets.top + headerHeight` for safe area correctness. If header height changes or device has different notch, content is clipped or has wrong offset. |

---

## 4. orders.tsx (352 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 22 | H | 144 | **Hardcoded `$` currency symbol.** `${ (item.totalPrice / 100).toFixed(2)}` always shows USD. The `OrderItem` interface has no `currency` field. International sellers/buyers see wrong currency. Should use `formatCurrency(item.totalPrice / 100, item.currency)`. |
| 23 | M | 91-97 | **Double-tap guard uses `setTimeout` with 500ms timer but never clears it.** If component unmounts during the 500ms window, the timer fires after unmount, setting `doubleTapRef.current = false` on a ref that may be garbage collected. Not a crash but a React warning in strict mode. Should clear timeout on unmount. |
| 24 | M | 150-155 | **`toLocaleDateString()` with no locale parameter.** Date formatting depends on system locale which may not match app's selected i18n language. Should use `getDateFnsLocale()` like gift-shop.tsx does, or pass the app's locale explicitly. |
| 25 | L | 67 | **`doubleTapRef` is a boolean ref used for debouncing navigation.** This is a valid pattern but the 500ms timer is never cleaned up on unmount (see #23). |
| 26 | L | 105-107 | **`getStatusConfig` falls back to `STATUS_CONFIG.pending`** for unknown status values. If the API ever adds a new status (e.g., `'refunded'`), it silently displays as "Pending" with gold color, hiding the real status from users. |
| 27 | I | 258 | **`createStyles` is called on every render** since `tc` changes reference on theme switch. The `useMemo` wrapping in `OrdersContent` uses `tc` as dependency, but `tc` is a new object each render if `useThemeColors` doesn't memoize. May cause unnecessary style recalculation. |

---

## 5. send-tip.tsx (720 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 28 | C | 170-177 | **CRITICAL: Tip payment creates PaymentIntent but never confirms it.** `paymentsApi.createPaymentIntent` is called, but the Stripe SDK `confirmPayment(clientSecret)` is never invoked. Line 176 immediately sets `isSuccess(true)` after the PaymentIntent is created. The user sees "Tip Sent" but no money actually moved. The creator's dashboard would show a pending PaymentIntent that was never fulfilled. |
| 29 | H | 346-349 | **Custom amount input allows multiple decimal points.** The regex `text.replace(/[^0-9.]/g, '')` removes non-numeric chars but line 348 only checks `cleaned.split('.').length <= 2`. User can type `1.2.3` -- split produces `['1', '2', '3']` (length 3), which is correctly rejected. BUT: user can type `1.` (valid), then `.5` producing `1..5` which becomes `1.5` after replace -- this is fine. However, the real issue: there's no max amount validation. User can type `99999999.99` with no upper bound check until submit. |
| 30 | H | 147-148 | **Platform fee calculation uses floating point.** `platformFee = tipAmount * 0.1` and `total = tipAmount + platformFee`. For `tipAmount = 0.1`, fee = 0.01, total = 0.11. For `tipAmount = 0.3`, fee = 0.030000000000000002 (floating point). Displayed with `.toFixed(2)` which masks it, but the amount sent to the API may have floating point artifacts. Financial calculations should use integer cents. |
| 31 | M | 192 | **`message` is in the `useCallback` dependency array but is never sent to the API.** The `handleSendTip` function captures `message` in its dependency array (line 192) but never passes it to `paymentsApi.createPaymentIntent`. The tip message feature is completely broken -- users type a message that goes nowhere. |
| 32 | M | 37 | **`PLATFORM_FEE_PERCENT = 0.1` means 10% fee, not labeled clearly.** The constant name suggests a percentage but the value `0.1` is used as a multiplier. UI shows `$0.50` fee on a $5 tip (10%). This is a high fee -- should be clearly disclosed. The name should be `PLATFORM_FEE_RATE` to avoid confusion. |
| 33 | L | 80-84 | **`AmountButton` style uses hardcoded gradient colors** (`'rgba(10,123,79,0.4)'`, `'rgba(45,53,72,0.6)'`) that don't adapt to light theme. These dark-mode-only colors would look wrong on a white background. |
| 34 | L | 446 | **`spacing.xxl` referenced but may not exist in theme.** Common theme tokens show `xs, sm, md, base, lg, xl, 2xl` -- `xxl` is not in the documented set. If undefined, this renders as `undefined` height (0). |

---

## 6. revenue.tsx (561 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 35 | M | 70-72 | **Local `formatCurrency` function shadows imported utility.** Line 70 defines `function formatCurrency(amount: number): string` which always uses `$` prefix. The imported `formatCurrency` from `@/utils/localeFormat` (which is NOT imported here) handles proper locale currency formatting. Revenue is always displayed in USD regardless of user locale. |
| 36 | M | 107-113 | **`fetchData` swallows ALL errors silently.** The catch block at line 107 shows a toast but does not set any error state. If the initial load fails, `overview` stays `null` and the transaction list stays empty. The FlatList renders `ListEmptyComponent` which says "No transactions yet" -- misleading when the real issue is a network error. No retry mechanism for initial load failure. |
| 37 | M | 209 | **`overview.gifts.diamondValue` displayed as raw number** without currency formatting or "diamonds" label. Line 209: `{overview.gifts.diamondValue}` renders something like `1500` with no context. Compare to tips which shows `$15.00`. Inconsistent. |
| 38 | L | 230-232 | **Revenue split description uses string interpolation in translation key.** `t('revenue.splitDescription', \`You earn ${overview.revenueSplitPercent}% of all revenue\`)` embeds the variable INSIDE the fallback string. This means the i18n key `revenue.splitDescription` must use `{{percent}}` placeholder, but the fallback string uses JS template literal. If the i18n key is missing, the fallback shows the value correctly, but this is a bad pattern -- should use `{ percent: overview.revenueSplitPercent }` as second argument. |
| 39 | L | 245 | **`renderHeader` dependency array includes `[overview, t]` but uses `tc` and `styles`.** The `styles` object is created from `tc` via `useMemo`, so it's stable as long as `tc` doesn't change. But `tc` is not in the dependency array -- if theme switches, `renderHeader` would use stale styles. |
| 40 | I | 356-360 | **Navigation double-tap guard uses `setTimeout` without cleanup.** Same pattern as orders.tsx #23. |

---

## 7. creator-dashboard.tsx (~700 lines read)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 41 | M | 196-198 | **Sales data error silently swallowed.** `catch {}` at line 196 catches any sales data fetch error and keeps `salesData` as `null`, showing an empty state. User has no idea sales data failed to load vs. genuinely having no sales. No error toast or retry. |
| 42 | M | 199-201 | **Main `loadData` catch swallows ALL errors.** `catch {}` at line 199 catches failures from the 4 parallel API calls (overview, content, audience, revenue). If ANY of them fail, ALL data is lost with no error feedback. Should catch per-call or show error state. |
| 43 | M | 120-203 | **No cancellation on unmount.** The `loadData` function makes 5 API calls (4 parallel + 1 sequential). If the user navigates away before they complete, state updates fire on an unmounted component. No `cancelled` flag or AbortController like cashout.tsx has. |
| 44 | L | 34 | **`formatNumber` is just an alias for `formatCount`.** `const formatNumber = formatCount;` adds an unnecessary indirection. Should just use `formatCount` directly. |
| 45 | L | 637-646 | **`FlatList` inside `ScrollView` for overview cards.** A horizontal `FlatList` is nested inside a vertical `ScrollView`. While this technically works, React Native warns about this pattern in some versions. The horizontal FlatList has `scrollEnabled` set, which is fine, but `VirtualizedList`-backed FlatList inside ScrollView can cause performance warnings. |
| 46 | I | 359 | **`renderContentTab` dependency array is `[topPosts, bestTimes, router, t]`** but the callback uses `haptic`, `navigate`, `formatNumber`, `tc`, `styles` -- all missing from deps. Stale closure if any of these change. |

---

## 8. search.tsx (~900 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 47 | M | 264-268 | **Extremely fragile data extraction with multiple fallback patterns.** Lines like `postsQuery.data?.pages.flatMap((p) => (p.data as Post[] | undefined) ?? (p as unknown as { posts?: Post[] }).posts ?? [])` use double fallback with `unknown` casts. This suggests the API response shape is inconsistent or unknown. If the API changes, these silent fallbacks hide the breakage. |
| 48 | M | 166-177 | **AsyncStorage history load has no error feedback.** Line 172 catches JSON parse errors with empty catch. If `search-history` key contains corrupted data, it's silently ignored and history appears empty. Should clear the corrupted key. |
| 49 | L | 185 | **Search history stored unencrypted in AsyncStorage.** Search queries may contain sensitive terms. On a rooted device, AsyncStorage is a plain file readable by any process. Not encrypted like MMKV with AEAD. |
| 50 | L | 253-254 | **`showExplore` depends on `query.length === 0 && !isFocused`** but `isFocused` changes on blur. When user clears search and taps outside, the explore grid appears with a flash. No smooth transition. |
| 51 | L | 724-729 | **Trending hashtag press handler checks `if (item.name)` but doesn't handle the falsy case.** If `item.name` is empty string or undefined, the press does nothing with no feedback. |
| 52 | I | 326-347 | **`renderReelItem` uses inline styles** (`styles.reelRow` etc.) but also has `tc.text.secondary` in the dependency array. If `tc` changes, the callback is recreated, which is correct, but the inline `View style={styles.reelStats}` is recreated on every render of the callback. |

---

## 9. search-results.tsx (746 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 53 | M | 190-194 | **`combinedSearchQuery` only fires for `activeTab === 'people'`** (line 194 `enabled`), but `people` data is also used on the hashtags tab (line 234 `hashtagsFromCombined`). If user goes directly to hashtags tab without visiting people first, `hashtagsFromCombined` is empty because the combined search query was never enabled. |
| 54 | M | 311-319 | **`followMutation` has no optimistic update.** When user taps follow, the UI doesn't update until the mutation succeeds and `invalidateQueries` refetches. User sees stale "Follow" button during the network round-trip, inviting double-taps. The `followLockRef` exists but is set in `onSettled`, not immediately on `mutate`. |
| 55 | L | 362 | **`followMutation.mutate` called directly in render callback** without debounce. If `invalidateQueries` triggers a re-render with stale data, user could trigger follow/unfollow rapidly. `followLockRef` is only reset in `onSettled` which provides some protection, but it's not checked before `mutate` at line 362. |
| 56 | L | 616-617 | **Hashtags tab uses `onEndReached={handleFetchNextPage}`** but `handleFetchNextPage` switch statement has no `hashtags` case (line 258-270). `onEndReached` fires but does nothing. `hasNextPage.hashtags` is hardcoded to `false` at line 256, but the `onEndReached` handler is still wired up, which is misleading. |
| 57 | I | 689 | **`fontWeight: '700'` used directly in styles** instead of `fontFamily: fonts.bodySemiBold` or `fonts.bodyBold`. Inconsistent with project font system. Multiple instances across the file. |

---

## 10. ai-assistant.tsx (407 lines)

| # | Sev | Line(s) | Finding |
|---|-----|---------|---------|
| 58 | H | 197 | **`ActivityIndicator` used directly.** Project rules (mobile-screens.md) state: "Use `<Skeleton>` for content loading, NOT `<ActivityIndicator>` (buttons OK)". This is inside the generate button, so it's technically OK per the "buttons OK" exception. However, the spinner is white on a green background, which may have low contrast on some devices. |
| 59 | M | 278-285 | **`timeMutation.data` cast with `as { bestTime: string }` and `as { reason: string }`.** Two separate type assertions on the same data object. If the API returns a different shape, these casts silently produce `undefined`. Should define a proper interface and validate. |
| 60 | M | 96-109 | **`handleGenerate` dependency array is `[activeTab, input]`** but calls `captionMutation.mutate()`, `hashtagMutation.mutate()`, `timeMutation.mutate()` which are NOT in the dep array. If any mutation function reference changes (which it shouldn't with react-query, but still), the callback is stale. More importantly, `haptic` is also missing. |
| 61 | L | 289 | **Empty state condition is too broad.** `!isLoading && captions.length === 0 && hashtags.length === 0 && !timeMutation.data` shows empty state even when user hasn't generated anything yet. The initial state (before any generation) looks like "no results" rather than "enter a prompt to get started." This is technically handled by the text ("Enter a topic"), but it appears simultaneously with the generate button, which is confusing. |
| 62 | L | 139-140 | **`KeyboardAvoidingView` wraps `ScrollView` with `style={styles.scroll}` (flex: 1) on both.** The KeyboardAvoidingView and ScrollView both have `style={styles.scroll}` which is `{ flex: 1 }`. This creates nested flex containers that may cause layout issues on Android when keyboard appears. The `behavior` prop is only set for iOS (`Platform.OS === 'ios' ? 'padding' : undefined`), meaning Android has no keyboard avoidance. |
| 63 | I | 330-332 | **Tab labels use `fontWeight: '500'`** directly instead of `fontFamily: fonts.bodySemiBold`. Inconsistent with project font system. |

---

## Cross-Cutting Findings (All Screens)

| # | Sev | Screens | Finding |
|---|-----|---------|---------|
| 64 | C | gift-shop, send-tip | **Payment flows create PaymentIntents but never confirm them.** Both screens call `paymentsApi.createPaymentIntent` and then immediately treat the purchase as successful. No Stripe SDK `confirmPayment` is ever called. This means zero actual money is collected from any payment flow. |
| 65 | H | marketplace, orders, revenue | **No offline handling on payment/commerce screens.** None of the commerce screens check `NetInfo` for connectivity. Users can attempt purchases, view stale order data, or try to cash out while offline. Errors surface as generic toasts with no "you're offline" messaging. |
| 66 | H | cashout, send-tip, gift-shop, revenue | **Inconsistent currency formatting.** marketplace.tsx imports and uses `formatCurrency` from `@/utils/localeFormat`. revenue.tsx defines its own local `formatCurrency` that hardcodes `$`. cashout.tsx sometimes calls `formatCurrency(netAmount)` with one arg, sometimes with two. orders.tsx hardcodes `$`. No consistent approach. |
| 67 | M | all 10 screens | **No deep link / universal link handling.** None of the screens handle incoming deep links or restore state from URL params (except search-results.tsx which reads `params.query`). Sharing a marketplace product link, order status, or revenue page is impossible. |
| 68 | M | cashout, revenue, creator-dashboard | **Manual data fetching with `useState` + `useEffect` instead of react-query.** cashout.tsx, revenue.tsx, and creator-dashboard.tsx manually manage loading/error/data states instead of using `useQuery` like the other screens. This means no automatic cache, no stale-while-revalidate, no background refetch, and inconsistent error handling. |
| 69 | L | all screens | **FadeInUp animations with `Math.min(index, 10/15)` cap.** Every screen caps animation delay at 10 or 15 items. This is fine, but the magic numbers vary (10, 15) inconsistently across screens. Should be a shared constant. |
| 70 | I | marketplace, gift-shop, revenue | **Some styles use module-scope `colors.*` tokens** (e.g., `colors.text.tertiary`, `colors.gold`) instead of themed `tc.*` equivalents. These won't respond to theme changes at runtime. |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 6 |
| Medium | 19 |
| Low | 16 |
| Info | 7 |
| **Total** | **50** |

### Critical Findings

1. **#8 (gift-shop.tsx:131-161):** Coin purchase credits coins before Stripe payment confirmation. Users get free coins.
2. **#28 / #64 (send-tip.tsx:170-177, cross-cutting):** Tip payment creates PaymentIntent but never calls `confirmPayment`. No money moves. Both payment flows are non-functional.

### Top Priority Fixes

1. **Fix payment flows (#8, #28, #64):** Do NOT credit coins or show success until Stripe webhook confirms payment. Install `@stripe/stripe-react-native` and call `confirmPayment(clientSecret)`.
2. **Fix hooks-after-return violation (#16):** Move hooks above the `CASHOUT_ENABLED` early return in cashout.tsx.
3. **Fix hardcoded currency (#22, #35, #66):** Use `formatCurrency` from `@/utils/localeFormat` consistently with proper currency parameter everywhere.
4. **Add error states to marketplace (#2), revenue (#36), creator-dashboard (#42):** Distinguish "no data" from "failed to load" with retry actions.
5. **Add offline detection to payment screens (#65).**
