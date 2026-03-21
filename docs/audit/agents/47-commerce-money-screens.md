# Agent 47: Commerce + Money Screens — Deep Line-by-Line Audit

**Auditor:** Claude Opus 4.6 Agent #47 of 67
**Date:** 2026-03-21
**Scope:** All commerce/money mobile screens + paymentsApi.ts + monetizationApi.ts + giftsApi.ts + backend service verification
**Files Audited (line by line):**

1. `apps/mobile/src/services/paymentsApi.ts` (32 lines)
2. `apps/mobile/src/services/monetizationApi.ts` (59 lines)
3. `apps/mobile/src/services/giftsApi.ts` (44 lines)
4. `apps/mobile/src/types/payments.ts` (44 lines)
5. `apps/mobile/app/(screens)/marketplace.tsx` (511 lines)
6. `apps/mobile/app/(screens)/send-tip.tsx` (698 lines)
7. `apps/mobile/app/(screens)/enable-tips.tsx` (674 lines)
8. `apps/mobile/app/(screens)/donate.tsx` (504 lines)
9. `apps/mobile/app/(screens)/waqf.tsx` (156 lines)
10. `apps/mobile/app/(screens)/cashout.tsx` (719 lines)
11. `apps/mobile/app/(screens)/zakat-calculator.tsx` (883 lines)
12. `apps/mobile/app/(screens)/gift-shop.tsx` (720 lines)
13. `apps/mobile/app/(screens)/creator-storefront.tsx` (461 lines)
14. `apps/mobile/app/(screens)/halal-finder.tsx` (358 lines)

**Backend verification files checked:**
- `apps/api/src/modules/monetization/monetization.controller.ts`
- `apps/api/src/modules/monetization/monetization.service.ts`
- `apps/api/src/modules/gifts/gifts.controller.ts`
- `apps/api/src/modules/gifts/gifts.service.ts`
- `apps/api/src/modules/payments/payments.controller.ts`
- `apps/api/src/modules/payments/payments.service.ts`
- `apps/api/src/modules/community/community.controller.ts` (waqf endpoints)
- `apps/api/src/modules/islamic/islamic.controller.ts` (charity endpoints)

---

## CRITICAL FINDINGS (Ship Blockers)

---

### FINDING 1: paymentsApi.ts is COMPLETELY ORPHANED — Zero imports across entire mobile app

**File:** `apps/mobile/src/services/paymentsApi.ts`
**Lines:** 1-32 (entire file)
**Severity:** CRITICAL (Ship Blocker)
**Category:** Dead Code / Missing Payment Integration

**Evidence:** grep for `paymentsApi` across `apps/mobile/app/` returns ZERO files. The entire Stripe payment flow service — `createPaymentIntent`, `createSubscription`, `cancelSubscription`, `getPaymentMethods`, `attachPaymentMethod` — is never imported or called by any screen.

**Code:**
```typescript
export const paymentsApi = {
  createPaymentIntent: (data: CreatePaymentIntentDto) =>
    api.post<PaymentIntent>('/payments/create-payment-intent', data),
  createSubscription: (data: CreateSubscriptionDto) =>
    api.post<void>('/payments/create-subscription', data),
  // ... 5 methods, all unused
};
```

**Impact:** The backend has a fully functional Stripe integration (`payments.service.ts` creates real Stripe PaymentIntents, Subscriptions, and manages payment methods). The mobile app has a complete API service to call it. But NO screen ever calls it. Every money flow on mobile bypasses Stripe entirely.

---

### FINDING 2: send-tip.tsx creates DB tip record WITHOUT any payment — real money "sent" for free

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 151-176 (handleSendTip function)
**Severity:** CRITICAL (Ship Blocker)
**Category:** Missing Payment Integration

**Code:**
```typescript
const handleSendTip = useCallback(async () => {
  // ...
  await monetizationApi.sendTip({
    receiverId: creator.id,
    amount: tipAmount,
    message: message.trim() || undefined,
    currency: 'USD',
  });
  setIsSuccess(true);
  haptic.success();
  // ...
}, [creator, tipAmount, message, haptic]);
```

**What this calls:** `monetizationApi.sendTip` -> `POST /monetization/tips` -> `MonetizationService.sendTip()` which does:
```typescript
// monetization.service.ts line 39-62
const tip = await this.prisma.tip.create({
  data: {
    senderId, receiverId, amount,
    currency: 'USD', message, platformFee,
    status: 'completed',  // <-- Immediately "completed" with no payment!
  },
});
// "Update user balance or stats (if we had a balance field)"
// "For now, just return the tip"
return tip;
```

**Impact:** User taps "Send $50 tip", backend creates a `Tip` record with `status: 'completed'` — but ZERO money moves. No Stripe PaymentIntent, no balance deduction, nothing. The tip is recorded as "completed" in the database without any payment processing. Meanwhile, `payments.service.ts` has a fully working `createPaymentIntent()` that creates real Stripe charges, but it's never called from mobile.

**The correct flow should be:**
1. Mobile calls `paymentsApi.createPaymentIntent()` to get a Stripe clientSecret
2. Mobile presents Stripe payment sheet (needs `@stripe/stripe-react-native` — NOT INSTALLED)
3. On payment success, backend webhook marks tip as completed

**None of these steps happen.**

---

### FINDING 3: gift-shop.tsx purchaseCoins gives FREE coins — no payment collected

**File:** `apps/mobile/app/(screens)/gift-shop.tsx`
**Lines:** 77-83, 101-104
**Severity:** CRITICAL (Ship Blocker)
**Category:** Free Money Exploit

**Code (mobile):**
```typescript
const purchaseMutation = useMutation({
  mutationFn: (amount: number) => giftsApi.purchaseCoins({ amount }),
  // ...
});

const handleBuyCoins = (amount: number) => {
  haptic.medium();
  purchaseMutation.mutate(amount);
};
```

**Code (backend - gifts.service.ts lines 63-87):**
```typescript
async purchaseCoins(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestException('Amount must be a positive integer');
  }
  const balance = await this.prisma.coinBalance.upsert({
    where: { userId },
    update: { coins: { increment: amount } },
    create: { userId, coins: amount, diamonds: 0 },
  });
  // Creates transaction record... but collects NO PAYMENT
  return { coins: balance.coins, diamonds: balance.diamonds };
}
```

**Impact:** Any authenticated user can call `POST /gifts/purchase` with `{ amount: 999999 }` and receive 999,999 free coins. The UI shows prices ("$0.99", "$4.99", etc.) but the amount sent to the backend is just the coin count (100, 500, 1000, 5000) — not a price. The backend blindly credits coins without any Stripe charge.

**Additional detail:** The `giftsApi.purchaseCoins` accepts an optional `paymentMethodId` parameter in its type but the backend DTO (`PurchaseCoinsDto`) only has `amount`. Even if paymentMethodId were sent, the backend ignores it.

---

### FINDING 4: gift-shop.tsx cashout deducts diamonds but sends NO real money

**File:** `apps/mobile/app/(screens)/gift-shop.tsx`
**Lines:** 85-92, 117-121
**Severity:** CRITICAL (Ship Blocker)
**Category:** Missing Payout Integration

**Code (mobile):**
```typescript
const cashoutMutation = useMutation({
  mutationFn: (diamonds: number) => giftsApi.cashout({ diamonds }),
});
const handleCashout = () => {
  if (balance && balance.diamonds > 0) {
    cashoutMutation.mutate(balance.diamonds);
  }
};
```

**Code (backend - gifts.service.ts lines 203-249):**
```typescript
async cashout(userId: string, diamonds: number): Promise<CashoutResult> {
  // ... validation ...
  const updated = await this.prisma.coinBalance.updateMany({
    where: { userId, diamonds: { gte: diamonds } },
    data: { diamonds: { decrement: diamonds } },
  });
  // Creates transaction record with description "Cashed out X diamonds for $Y"
  return { diamondsDeducted: diamonds, usdAmount, remainingDiamonds: balance.diamonds - diamonds };
}
```

**Impact:** Diamonds are deducted from the user's balance. A "cashout" record is created. But NO Stripe payout/transfer is initiated. No money is sent to any bank account. The user's diamonds disappear into the void. The response says "$X.XX" was "cashed out" but it never reaches the user.

---

### FINDING 5: cashout.tsx calls non-existent wallet endpoints

**File:** `apps/mobile/app/(screens)/cashout.tsx`
**Lines:** 49-59
**Severity:** CRITICAL (Ship Blocker)
**Category:** Non-existent API Endpoints

**Code:**
```typescript
const walletApi = {
  getBalance: () =>
    api.get<WalletBalance>('/monetization/wallet/balance'),
  getPaymentMethods: () =>
    api.get<PaymentMethod[]>('/monetization/wallet/payment-methods'),
  requestCashout: (payload: { amount: number; payoutSpeed: PayoutSpeed; paymentMethodId: string }) =>
    api.post<{ success: boolean }>('/monetization/wallet/cashout', payload),
};
```

**Reality:** The backend `MonetizationController` has NO wallet endpoints. The only routes under `/monetization/` are:
- `POST /monetization/tips`
- `GET /monetization/tips/sent`
- `GET /monetization/tips/received`
- `GET /monetization/tips/stats`
- `POST /monetization/tiers`
- `GET /monetization/tiers/:userId`
- `PATCH /monetization/tiers/:id`
- `DELETE /monetization/tiers/:id`
- `PATCH /monetization/tiers/:id/toggle`
- `POST /monetization/subscribe/:tierId`
- `DELETE /monetization/subscribe/:tierId`
- `GET /monetization/subscribers`

There is NO `/monetization/wallet/balance`, NO `/monetization/wallet/payment-methods`, NO `/monetization/wallet/cashout`.

**Impact:** This screen will always show loading skeleton (the API calls fail silently — the error is caught at line 100 with just `// Use defaults on error`), then display 0 diamonds and 0 balance with no payment methods. The "Confirm Cash Out" button will always fail with a generic error.

---

### FINDING 6: donate.tsx calls islamicApi.donate which creates DB record WITHOUT payment

**File:** `apps/mobile/app/(screens)/donate.tsx`
**Lines:** 63-72, 87-95
**Severity:** CRITICAL (Ship Blocker)
**Category:** Missing Payment Integration

**Code:**
```typescript
const donateMutation = useMutation({
  mutationFn: islamicApi.donate,
  onSuccess: () => {
    setShowSuccess(true);
    // ...
  },
});
const handleDonate = () => {
  const amount = getAmount();
  if (amount < 100) return; // minimum $1.00
  donateMutation.mutate({
    campaignId: params.campaignId,
    amount,
    currency,
  });
};
```

**Backend path:** `islamicApi.donate` -> `POST /islamic/charity/donate` -> `IslamicService.donate()`. This creates a `CharityDonation` record in the database. But NO payment is collected. The donation is recorded as if it happened, the campaign's `raisedAmount` may be incremented, but zero actual money changes hands.

**Impact:** Users see a success screen saying "Your donation has been received!" but no money was charged. Charity campaigns show inflated "raised" amounts that have no backing funds.

---

### FINDING 7: waqf.tsx uses raw fetch() WITHOUT authentication

**File:** `apps/mobile/app/(screens)/waqf.tsx`
**Lines:** 17, 26-35
**Severity:** CRITICAL (Security / Functionality)
**Category:** Unauthenticated API Call / Wrong Endpoint

**Code:**
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const fundsQuery = useInfiniteQuery({
  queryKey: ['waqf-funds'],
  queryFn: async ({ pageParam }) => {
    const params = new URLSearchParams();
    if (pageParam) params.set('cursor', pageParam);
    const res = await fetch(`${API_BASE}/waqf?${params}`);
    return res.json();
  },
  // ...
});
```

**Problems:**
1. **Uses raw `fetch()` instead of the `api` service** — no auth token attached. The backend `CommunityController` uses `OptionalClerkAuthGuard` for GET waqf, so it won't 401, but any waqf endpoint that requires auth (like contributing) will fail.
2. **Wrong URL path:** The screen calls `/waqf` but the backend endpoint is at `/community/waqf` (the `CommunityController` is at `@Controller('community')` with `@Get('waqf')` route). This will return 404.
3. **No error handling:** If the fetch fails, `res.json()` may throw on non-JSON response. No try/catch.

**Impact:** Screen will always show "No Waqf Funds" (empty state) because the endpoint path is wrong AND there's no auth token.

---

### FINDING 8: waqf.tsx "Contribute" button is a complete no-op

**File:** `apps/mobile/app/(screens)/waqf.tsx`
**Lines:** 79
**Severity:** CRITICAL (Dead Feature)
**Category:** No-op Button

**Code:**
```typescript
<Pressable accessibilityRole="button" style={styles.contributeBtn} onPress={() => haptic.light()}>
  <LinearGradient colors={[colors.gold, '#D4A94F']} style={styles.contributeBtnGradient}>
    <Icon name="heart" size="sm" color="#FFF" />
    <Text style={styles.contributeBtnText}>Contribute</Text>
  </LinearGradient>
</Pressable>
```

**Impact:** The "Contribute" button only triggers a haptic feedback. It does not navigate to a donation screen, does not open a payment flow, does not call any API. The button text "Contribute" is also hardcoded English (see Finding 17).

---

### FINDING 9: creator-storefront.tsx calls non-existent `/storefront/` endpoint

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Lines:** 68-71
**Severity:** CRITICAL (Ship Blocker)
**Category:** Non-existent API Endpoint

**Code:**
```typescript
const [productsRes, profileRes] = await Promise.all([
  api.get(`/storefront/${userId}/products`),
  api.get(`/users/${userId}`),
]);
```

**Reality:** There is NO `@Controller('storefront')` in the entire backend. No `storefront` module exists. The `/storefront/${userId}/products` call will return 404.

**Impact:** Creator storefront will always show zero products and the empty state. The FAB "Add Product" button redirects to marketplace (not a product creation screen), which itself calls `/products` — also a non-existent endpoint.

---

### FINDING 10: marketplace.tsx calls `commerceApi.getProducts` -> `/products` which has no backend controller

**File:** `apps/mobile/app/(screens)/marketplace.tsx`
**Lines:** 28, 101-112
**Severity:** CRITICAL (Ship Blocker)
**Category:** Non-existent API Endpoint

**Code:**
```typescript
import { commerceApi } from '@/services/api';
// ...
const productsQuery = useInfiniteQuery<ProductsResponse>({
  queryKey: ['marketplace-products', selectedCategory, searchQuery],
  queryFn: ({ pageParam }) =>
    commerceApi.getProducts({
      cursor: pageParam as string | undefined,
      category: selectedCategory === 'all' ? undefined : selectedCategory,
      search: searchQuery || undefined,
    }) as Promise<ProductsResponse>,
});
```

**`commerceApi.getProducts`** calls `api.get('/products?...')`. There is NO `@Controller('products')` in the backend. The entire marketplace product catalog system has no backend.

**Impact:** Marketplace screen will always show "No products found" empty state.

---

## HIGH SEVERITY FINDINGS

---

### FINDING 11: Dual tip systems — monetizationApi (no payment) vs paymentsApi (Stripe) — completely disconnected

**File:** `apps/mobile/src/services/monetizationApi.ts` lines 24-25, `apps/mobile/src/services/paymentsApi.ts` lines 13-15
**Severity:** HIGH
**Category:** Architecture / Conflicting Systems

**Evidence:** Two completely independent tip flows exist:
1. `monetizationApi.sendTip()` -> `POST /monetization/tips` -> Creates `Tip` record with `status: 'completed'` immediately. No payment.
2. `paymentsApi.createPaymentIntent()` -> `POST /payments/create-payment-intent` -> Creates real Stripe PaymentIntent + `Tip` record with `status: 'pending'`. Requires webhook to complete.

The mobile app uses path #1 exclusively. Path #2 (the correct one) is never called.

**Impact:** If someone later "fixes" this by switching to `paymentsApi`, they need to also install `@stripe/stripe-react-native`, implement the Stripe payment sheet, and handle webhook callbacks. It's not a simple swap.

---

### FINDING 12: Dual balance systems — User.coinBalance (field) vs CoinBalance (model) — will cause confusion

**File:** `apps/mobile/app/(screens)/gift-shop.tsx` lines 61-64
**Severity:** HIGH
**Category:** Data Integrity

The `GiftsService` uses `prisma.coinBalance` model (a separate table). But the Prisma schema also has a `coinBalance` field on the `User` model itself. These are two independent balance tracking systems. The gift shop reads from `CoinBalance` table, but other parts of the system may read from `User.coinBalance` field, leading to inconsistent balances.

---

### FINDING 13: marketplace.tsx has duplicate Pressable import — will crash or TypeScript error

**File:** `apps/mobile/app/(screens)/marketplace.tsx`
**Lines:** 9, 12
**Severity:** HIGH
**Category:** Compilation Error

**Code:**
```typescript
import {
  // ...
  Pressable,     // line 9
  // ...
  Pressable,     // line 12 — DUPLICATE
} from 'react-native';
```

**Impact:** Depending on bundler behavior, this may cause a TypeScript/bundler error, or silently use one import. React Native will likely not crash at runtime, but it's a code smell indicating generated/copy-pasted code.

---

### FINDING 14: cashout.tsx has duplicate Pressable import

**File:** `apps/mobile/app/(screens)/cashout.tsx`
**Lines:** 8, 10
**Severity:** HIGH
**Category:** Compilation Error

**Code:**
```typescript
import {
  // ...
  Pressable,     // line 8
  // ...
  Pressable,     // line 10 — DUPLICATE
} from 'react-native';
```

Same issue as Finding 13.

---

### FINDING 15: creator-storefront.tsx has duplicate Pressable import

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Lines:** 7, 11
**Severity:** HIGH
**Category:** Compilation Error

```typescript
import {
  // ...
  Pressable,     // line 7
  // ...
  Pressable,     // line 11 — DUPLICATE
} from 'react-native';
```

Same issue as Finding 13.

---

### FINDING 16: gift-shop.tsx has malformed import — missing closing brace on line 3

**File:** `apps/mobile/app/(screens)/gift-shop.tsx`
**Lines:** 1-4
**Severity:** HIGH
**Category:** Syntax Error

**Code:**
```typescript
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ScrollView,
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
```

Line 3 has a trailing comma after `ScrollView,` and line 4 starts a new `import` statement — the `}` from `'react-native'` is missing. This is a **syntax error** that would prevent the file from compiling.

**Impact:** This screen cannot render at all. It will crash at import time.

---

### FINDING 17: orders.tsx has malformed import — missing closing brace

**File:** `apps/mobile/app/(screens)/orders.tsx`
**Lines:** 7-9
**Severity:** HIGH
**Category:** Syntax Error

**Code (from the first 30 lines read):**
```typescript
import {
  // ...
  Pressable,
import Animated, { FadeInUp } from 'react-native-reanimated';
```

Same pattern as Finding 16. Missing `} from 'react-native';` before the next import.

**Impact:** This screen cannot render at all.

---

### FINDING 18: zakat-calculator.tsx is 100% client-side — ignores backend Zakat API entirely

**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 29-31, 180-199
**Severity:** HIGH
**Category:** Unused Backend / Hardcoded Values

**Code:**
```typescript
const NISAB_GOLD = 5800;   // Hardcoded
const NISAB_SILVER = 490;  // Hardcoded
const ZAKAT_RATE = 0.025;  // Hardcoded
```

The backend has a full Zakat module with configurable gold/silver prices via environment variables (`GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM`) and proper nisab calculation. The mobile screen ignores all of this and uses hardcoded 2024-era values.

**Impact:** Nisab thresholds change with gold/silver prices. As of early 2026, gold is significantly higher than $5,800/85g. The calculator will give incorrect zakat obligations.

---

### FINDING 19: zakat-calculator.tsx "Share" button is a no-op

**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 485
**Severity:** HIGH
**Category:** No-op Button

**Code:**
```typescript
<Pressable accessibilityRole="button" onPress={() => {}} style={styles.actionButtonHalf}>
```

The Share button's `onPress` is an empty function. No share functionality.

---

### FINDING 20: enable-tips.tsx "Save Settings" is a fake stub — saves nothing

**File:** `apps/mobile/app/(screens)/enable-tips.tsx`
**Lines:** 128-141
**Severity:** HIGH
**Category:** Stub / Fake Save

**Code:**
```typescript
const handleSave = useCallback(async () => {
  haptic.medium();
  setSubmitting(true);
  try {
    // Tip settings saved locally — backend updateTipSettings endpoint needed for persistence
    await new Promise(resolve => setTimeout(resolve, 300));  // <-- FAKE DELAY
    haptic.success();
    Alert.alert(t('common.success'), t('screens.enableTips.saveSuccess'));
  } catch (err) {
    Alert.alert(t('common.error'), t('screens.enableTips.saveError'));
  } finally {
    setSubmitting(false);
  }
}, [haptic, isEnabled, minTipAmount, displaySettings, thankYouMessage, isConnected]);
```

**Impact:** User configures tip settings (minimum amount, display preferences, thank-you message), taps "Save Settings", sees a success alert — but nothing is persisted. All settings are lost on screen remount. The comment even admits: "backend updateTipSettings endpoint needed for persistence".

---

### FINDING 21: enable-tips.tsx "Connect Payment Method" just toggles a local boolean

**File:** `apps/mobile/app/(screens)/enable-tips.tsx`
**Lines:** 143-146
**Severity:** HIGH
**Category:** Fake Feature

**Code:**
```typescript
const handleConnectPayment = useCallback(() => {
  haptic.light();
  setIsConnected(!isConnected);  // Just toggles local state!
}, [haptic, isConnected]);
```

**Impact:** The "Connect Payment Method" button is supposed to initiate Stripe Connect onboarding (or similar) so creators can receive tips. Instead, it just toggles a boolean in local state. No Stripe, no payment method, no bank account linked.

---

## MEDIUM SEVERITY FINDINGS

---

### FINDING 22: send-tip.tsx does not use the `VerifiedBadge` UI component — creates its own inline

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 77-88
**Severity:** MEDIUM
**Category:** Code Quality / Inconsistency

**Code:**
```typescript
function VerifiedBadge({ size = 13 }: { size?: number }) {
  return (
    <View style={[styles.verifiedBadge, { width: size, height: size }]}>
      <LinearGradient
        colors={[colors.emerald, colors.goldLight]}
        style={styles.verifiedGradient}
      >
        <Icon name="check" size="xs" color={colors.text.primary} />
      </LinearGradient>
    </View>
  );
}
```

**Impact:** Violates the CLAUDE.md rule: "Verified -> `<VerifiedBadge size={13} />` -- NEVER `checkmark` text". While it's not a text checkmark, it re-implements the component instead of importing `@/components/ui/VerifiedBadge`. If the shared component is updated, this inline version won't get the changes.

---

### FINDING 23: send-tip.tsx follower count text is hardcoded English

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 293
**Severity:** MEDIUM
**Category:** i18n Violation

**Code:**
```typescript
<Text style={styles.followerCount}>{formattedFollowers} followers</Text>
```

The word "followers" is hardcoded English, not passed through `t()`.

---

### FINDING 24: send-tip.tsx uses `Icon name="star"` for popular badge — "star" icon exists but semantically questionable

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 66
**Severity:** LOW
**Category:** Minor

The `star` icon name is valid (confirmed in Icon.tsx line 34). No issue here.

---

### FINDING 25: send-tip.tsx references `colors.goldLight` and `colors.emeraldDark` — verified they exist

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 64, 82, etc.
**Severity:** NONE (Verified OK)

Confirmed in theme: `emeraldLight: '#0D9B63'`, `emeraldDark: '#066B42'`, `goldLight: '#D4A94F'`.

---

### FINDING 26: send-tip.tsx references `spacing.xxl` — may not exist in theme

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 425
**Severity:** MEDIUM
**Category:** Potentially Undefined Theme Token

**Code:**
```typescript
<View style={{ height: spacing.xxl }} />
```

The CLAUDE.md documents spacing as: `xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32`. There's a `2xl` but no `xxl`. If `spacing.xxl` is undefined, this view will have `height: undefined` which defaults to 0 — the spacer does nothing.

---

### FINDING 27: send-tip.tsx ScreenErrorBoundary wraps only the main content, not loading/error states

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 90, 183-257, 259-429
**Severity:** MEDIUM
**Category:** Inconsistent Error Boundary

The component is `export default function SendTipScreen()` (not wrapped in ScreenErrorBoundary). The ScreenErrorBoundary is inside the render at line 260, wrapping only the main form. The loading state (lines 226-239) and error state (lines 241-257) are NOT wrapped in ScreenErrorBoundary. If an error occurs during rendering of the loading skeleton, it will crash without recovery.

---

### FINDING 28: donate.tsx uses `showBack` prop on GlassHeader instead of `leftAction`

**File:** `apps/mobile/app/(screens)/donate.tsx`
**Lines:** 113, 258
**Severity:** MEDIUM
**Category:** Inconsistent API Usage

**Code:**
```typescript
<GlassHeader title={t('charity.title')} showBack />
```

Every other commerce screen uses `leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}`. If `showBack` is not a supported prop on `GlassHeader`, the back button won't appear. Even if it is supported, it's inconsistent with the pattern used everywhere else.

---

### FINDING 29: donate.tsx uses `fontWeight` strings instead of `fontFamily` from theme

**File:** `apps/mobile/app/(screens)/donate.tsx`
**Lines:** 315-316, 330, 377, 400, 402, 427, 430, 460, 469, 489, 494
**Severity:** MEDIUM
**Category:** Theme Inconsistency

Multiple styles use `fontWeight: '600'` and `fontWeight: '700'` instead of `fontFamily: fonts.bodySemiBold` or `fontFamily: fonts.bodyBold`. This means the custom font families are not used — the system default font is used with a bold weight, which looks visually inconsistent with the rest of the app.

---

### FINDING 30: marketplace.tsx references `fonts.bodySemiBold` — verified it maps to `DMSans_500Medium`

**File:** `apps/mobile/app/(screens)/marketplace.tsx`
**Lines:** 400, 475, etc.
**Severity:** NONE (Verified OK)

Confirmed: `fonts.bodySemiBold = 'DMSans_500Medium'` exists in theme. However, note that "semiBold" mapped to "500Medium" is semantically misleading (500 is medium weight, not semibold/600). This is a pre-existing theme design decision, not a bug in this screen.

---

### FINDING 31: halal-finder.tsx GlassHeader leftAction uses JSX `icon` instead of string

**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 208-209
**Severity:** MEDIUM
**Category:** Potential API Mismatch

**Code:**
```typescript
leftAction={{
  icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />,
  onPress: () => router.back(),
  accessibilityLabel: 'Go back',
}}
```

Every other screen passes `icon: 'arrow-left'` (a string). This one passes a JSX element. If GlassHeader expects a string for `icon`, this will render `[object Object]` or crash. If GlassHeader supports both, it's just inconsistent.

Also: `accessibilityLabel: 'Go back'` is hardcoded English instead of using `t('common.back')`.

---

### FINDING 32: halal-finder.tsx empty state subtitle is hardcoded English

**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 197-198
**Severity:** MEDIUM
**Category:** i18n Violation

**Code:**
```typescript
subtitle={selectedCuisine
  ? `No ${selectedCuisine} restaurants found nearby`
  : 'No halal restaurants found nearby'}
```

Hardcoded English strings instead of using `t()`.

---

### FINDING 33: halal-finder.tsx restaurantsQuery accesses `.data.data` — double-nested

**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 130-138, 142
**Severity:** MEDIUM
**Category:** Likely Data Shape Mismatch

**Code:**
```typescript
queryFn: () =>
  api.get('/halal/restaurants', {
    params: { lat, lng, radius: 25, ... },
  }).then((r) => r.data),  // <-- unwraps .data

// Then:
const restaurants: HalalRestaurant[] = restaurantsQuery.data?.data ?? [];
//                                                        ^--- accesses .data again
```

The `api.get()` call uses `.then((r) => r.data)` to unwrap the response, then the component accesses `.data` again. This double-unwrap means:
- If the API response is `{ data: { data: [...] } }` — works (but unusual)
- If the API response is `{ data: [...] }` — `restaurantsQuery.data` is the array, `.data` on an array is `undefined`, so restaurants is always `[]`

Most likely the restaurants list will always be empty even if the endpoint returns data.

---

### FINDING 34: waqf.tsx hardcoded English strings

**File:** `apps/mobile/app/(screens)/waqf.tsx`
**Lines:** 74, 82-83, 102-103
**Severity:** MEDIUM
**Category:** i18n Violation

**Code:**
```typescript
<Text style={styles.raisedAmount}>${raised.toLocaleString()}</Text>       // line 74
<Text style={styles.goalAmount}>of ${goal.toLocaleString()}</Text>        // line 75
<Text style={styles.contributeBtnText}>Contribute</Text>                  // line 82
// Info card text:
"Waqf is an Islamic endowment — a permanent charitable fund..."           // line 103
```

All hardcoded English, not using `t()`.

---

### FINDING 35: cashout.tsx references `colors.dark.borderLight` — may not exist

**File:** `apps/mobile/app/(screens)/cashout.tsx`
**Lines:** 691
**Severity:** MEDIUM
**Category:** Potentially Undefined Theme Token

**Code:**
```typescript
radioOuter: {
  // ...
  borderColor: colors.dark.borderLight,
```

The CLAUDE.md documents `colors.dark.border = '#30363D'` but does not mention `colors.dark.borderLight`. If this token doesn't exist in the theme, it will be `undefined` which React Native treats as no border color (transparent).

---

### FINDING 36: cashout.tsx references `shadow.glow` — may not exist

**File:** `apps/mobile/app/(screens)/cashout.tsx`
**Lines:** 464
**Severity:** MEDIUM
**Category:** Potentially Undefined Theme Token

**Code:**
```typescript
successGradient: {
  // ...
  ...shadow.glow,
```

The CLAUDE.md does not mention `shadow.glow` as a valid shadow preset. If undefined, the spread will have no effect (not a crash, but missing visual).

---

### FINDING 37: cashout.tsx references `fontSize['3xl']` — may not exist

**File:** `apps/mobile/app/(screens)/cashout.tsx`
**Lines:** 497, 524
**Severity:** MEDIUM
**Category:** Potentially Undefined Theme Token

The CLAUDE.md documents fontSize as: `xs=11 sm=13 base=15 md=17 lg=20 xl=24`. No `2xl` or `3xl`. If `fontSize['3xl']` is undefined, the text will have no fontSize set (defaults to 14).

---

### FINDING 38: gift-shop.tsx history response type mismatch

**File:** `apps/mobile/app/(screens)/gift-shop.tsx`
**Lines:** 71, 336
**Severity:** MEDIUM
**Category:** Type Mismatch

**Code:**
```typescript
const { data: history } = useQuery({
  queryKey: ['gifts', 'history'],
  queryFn: () => giftsApi.getHistory(),
});
// ...
const historyData = Array.isArray(history) ? history : [];
```

The `giftsApi.getHistory()` returns `GiftHistoryItem[]` according to its type, but the backend actually returns `{ data: CoinTransaction[], meta: { cursor, hasMore } }`. The backend returns `CoinTransaction` records (with fields like `userId`, `type`, `amount`, `description`), not `GiftHistoryItem` records (with fields like `giftType`, `senderId`, `receiverId`, `senderName`).

**Impact:** The history tab will either show empty or crash when trying to access `item.giftType`, `item.senderName`, etc. on objects that don't have those fields.

---

### FINDING 39: gift-shop.tsx renders gifts using `getGiftIcon()` fallback icons that don't match actual gifts

**File:** `apps/mobile/app/(screens)/gift-shop.tsx`
**Lines:** 31-39
**Severity:** LOW
**Category:** UX / Visual

**Code:**
```typescript
const DEFAULT_GIFTS = [
  { type: 'rose', name: 'Rose', coins: 1, icon: 'heart' },
  { type: 'heart', name: 'Heart', coins: 5, icon: 'heart-filled' },
  { type: 'star', name: 'Star', coins: 10, icon: 'trending-up' },
  { type: 'crescent', name: 'Crescent', coins: 50, icon: 'globe' },
  { type: 'mosque', name: 'Mosque', coins: 100, icon: 'layers' },
  { type: 'diamond', name: 'Diamond', coins: 500, icon: 'bookmark' },
  { type: 'crown', name: 'Crown', coins: 1000, icon: 'check-circle' },
  { type: 'galaxy', name: 'Galaxy', coins: 5000, icon: 'globe' },
];
```

The icon mappings are nonsensical: a diamond shows a bookmark, a mosque shows layers, a crown shows a check-circle, a galaxy shows a globe. These are placeholder icons that were never replaced with proper gift icons/images.

---

### FINDING 40: zakat-calculator.tsx uses invalid icon names: `calculator`, `briefcase`, `home`, `credit-card`, `book-open`, `repeat`

**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 257, 274, 281, 294, 302, 341, 347, 388, 466, 481
**Severity:** VERIFIED OK

After checking Icon.tsx, ALL these icon names are valid:
- `calculator` — line 34 of Icon.tsx
- `briefcase` — line 37 of Icon.tsx
- `home` — line 24 of Icon.tsx
- `credit-card` — line 37 of Icon.tsx
- `book-open` — line 34 of Icon.tsx
- `repeat` — line 28 of Icon.tsx

No issue here.

---

### FINDING 41: marketplace.tsx star rating uses heart icons instead of star icons

**File:** `apps/mobile/app/(screens)/marketplace.tsx`
**Lines:** 64-84
**Severity:** LOW
**Category:** UX / Visual

**Code:**
```typescript
function renderStars(rating: number) {
  // ...
  stars.push(<Icon key={...} name="heart-filled" size="xs" color={colors.gold} />);
  // ...
  stars.push(<Icon key={...} name="heart" size="xs" color={colors.text.tertiary} />);
```

The function is called `renderStars` but renders heart icons. The `star` icon IS available in the icon set. This appears to be a conscious choice given the Islamic heart-based aesthetic, but the function name is misleading.

---

### FINDING 42: halal-finder.tsx uses `Icon name="heart-filled" size={12}` — numeric size

**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 88
**Severity:** LOW
**Category:** Minor Inconsistency

**Code:**
```typescript
<Icon name="heart-filled" size={12} color={colors.gold} />
```

The Icon component accepts both string sizes ('xs'=16, 'sm'=20, etc.) and numeric sizes. Using `12` is below the smallest named size (xs=16). This is valid but very small, possibly too small to be visible.

---

### FINDING 43: enable-tips.tsx imports `Switch` from react-native but never uses it

**File:** `apps/mobile/app/(screens)/enable-tips.tsx`
**Lines:** 10
**Severity:** LOW
**Category:** Dead Import

**Code:**
```typescript
import { /* ... */ Switch, /* ... */ } from 'react-native';
```

`Switch` is imported but the screen uses a custom `CustomToggle` component instead. Dead import.

---

### FINDING 44: send-tip.tsx `fetchCreator` dependency array missing `t`

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 113-131
**Severity:** LOW
**Category:** React Hooks / Stale Closure

**Code:**
```typescript
const fetchCreator = useCallback(async () => {
  // ...
  setError(t('monetization.errors.noUserSpecified'));
  // ...
  setError(t('monetization.errors.failedToLoadCreatorInfo'));
  // ...
}, [params.username]);  // <-- missing `t` dependency
```

The `t` function is used inside the callback but not in the dependency array. If the language changes, error messages won't update until `params.username` changes.

---

### FINDING 45: Multiple screens have `{ height: spacing.xxl }` bottom spacer

**Files:** `send-tip.tsx` line 425, `enable-tips.tsx` line 427, `zakat-calculator.tsx` line 499
**Severity:** LOW
**Category:** Potentially Undefined Theme Token (same as Finding 26)

If `spacing.xxl` doesn't exist, all these bottom spacers contribute 0 height — minor visual issue.

---

### FINDING 46: send-tip.tsx custom amount allows floating point shenanigans

**File:** `apps/mobile/app/(screens)/send-tip.tsx`
**Lines:** 325-329
**Severity:** LOW
**Category:** Input Validation

**Code:**
```typescript
onChangeText={(text) => {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned.split('.').length <= 2) {
    setCustomAmount(cleaned);
  }
}}
```

This allows inputs like `.`, `0.0.` (two dots prevented but single dot allowed), which `parseFloat` at line 141 converts to `NaN` -> `0`. The validation at line 156 (`tipAmount <= 0`) catches it, but the UX is poor — user sees a dot in the input but the summary shows $0.00.

---

### FINDING 47: donate.tsx does not validate custom amount for negative values

**File:** `apps/mobile/app/(screens)/donate.tsx`
**Lines:** 78-85
**Severity:** LOW
**Category:** Input Validation

**Code:**
```typescript
const getAmount = (): number => {
  if (isCustom) {
    const parsed = parseFloat(customAmount);
    if (isNaN(parsed) || parsed < 1) return 0;
    return Math.round(parsed * 100);
  }
  return selectedAmount || 0;
};
```

`parseFloat('-5')` returns -5, which is less than 1, so it returns 0. This is handled, but the `handleDonate` check at line 89 (`amount < 100`) also catches it. The validation is adequate but spread across multiple places.

---

---

## SUMMARY

### By Severity:
| Severity | Count |
|----------|-------|
| CRITICAL (Ship Blocker) | 10 |
| HIGH | 11 |
| MEDIUM | 12 |
| LOW | 8 |
| Verified OK | 3 |
| **Total** | **44** |

### Top 5 Most Critical Findings:

1. **paymentsApi.ts is ORPHANED** — The entire Stripe payment integration for mobile is built but never connected. Zero screens import it.

2. **ALL money actions create DB records WITHOUT payment** — sendTip (completed without Stripe), purchaseCoins (free coins), donate (free donations), cashout (diamonds vanish). Every financial transaction in the app is fake.

3. **cashout.tsx calls 3 non-existent endpoints** — `/monetization/wallet/balance`, `/monetization/wallet/payment-methods`, `/monetization/wallet/cashout` do not exist anywhere in the backend.

4. **creator-storefront.tsx calls non-existent `/storefront/` endpoint** and **marketplace.tsx calls non-existent `/products` endpoint** — The entire commerce system has no backend.

5. **gift-shop.tsx has a SYNTAX ERROR** (missing closing brace on react-native import) — the screen cannot render at all. Same for orders.tsx.

### Key Architecture Problem:

The backend has two separate working systems:
- **PaymentsService** — Real Stripe integration with PaymentIntents, Subscriptions, webhook handlers
- **MonetizationService** — Direct DB writes with no payment processing
- **GiftsService** — Direct DB writes with no payment processing

The mobile app exclusively uses the non-payment systems. The Stripe integration exists in the backend but is completely unreachable from mobile because:
1. `paymentsApi.ts` is never imported
2. `@stripe/stripe-react-native` is not installed
3. No payment sheet / card input UI exists anywhere in the mobile app

Every "Buy", "Tip", "Donate", "Subscribe", and "Cash Out" action in the app is theater — the UI shows success but no money moves.
