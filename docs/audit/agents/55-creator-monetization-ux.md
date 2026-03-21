# Agent 55 — Creator/Monetization UX (End-to-End Flow Audit)

**Scope:** Complete creator monetization flow from backend to mobile
**Files audited:**
- `apps/api/src/modules/monetization/` (all 7 files)
- `apps/api/src/modules/gifts/` (all 9 files)
- `apps/api/src/modules/payments/` (all 8 files)
- `apps/api/src/modules/creator/` (all 5 files)
- `apps/api/src/modules/scheduling/scheduling.service.ts`
- `apps/mobile/src/services/paymentsApi.ts`
- `apps/mobile/src/services/monetizationApi.ts`
- `apps/mobile/src/services/giftsApi.ts`
- `apps/mobile/src/services/creatorApi.ts`
- `apps/mobile/src/hooks/usePayment.ts`
- `apps/mobile/src/types/payments.ts`
- `apps/mobile/src/types/monetization.ts`
- `apps/mobile/app/(screens)/cashout.tsx`
- `apps/mobile/app/(screens)/send-tip.tsx`
- `apps/mobile/app/(screens)/enable-tips.tsx`
- `apps/mobile/app/(screens)/gift-shop.tsx`
- `apps/mobile/app/(screens)/creator-dashboard.tsx`
- `apps/mobile/app/(screens)/creator-storefront.tsx`
- `apps/mobile/app/(screens)/membership-tiers.tsx`
- `apps/api/prisma/schema.prisma` (Tip, MembershipTier, MembershipSubscription, CoinBalance, CoinTransaction, GiftRecord, CreatorEarning models)

**Total findings: 47**

---

## FINDING 1 — CRITICAL: Dual Balance System (Diamond/Coin Split Across Two Tables)
**Severity:** P0 — Ship Blocker
**File:** `apps/api/prisma/schema.prisma` (lines 267-268 vs 2357-2368)
**Code — User model (line 267-268):**
```
coinBalance            Int      @default(0)
diamondBalance         Int      @default(0)
```
**Code — CoinBalance model (line 2357-2368):**
```
model CoinBalance {
  id        String   @id @default(cuid())
  userId    String   @unique
  coins     Int      @default(0)
  diamonds  Int      @default(0)
}
```
**Explanation:** There are TWO completely independent balance systems. `User.coinBalance`/`User.diamondBalance` and `CoinBalance.coins`/`CoinBalance.diamonds`. The `GiftsService` uses `CoinBalance` table exclusively. The `StripeConnectService` uses `User.coinBalance`/`User.diamondBalance` exclusively. These NEVER synchronize. A creator who receives gifts via `GiftsService.sendGift()` gets diamonds in `CoinBalance.diamonds`, but if they try to cash out via `StripeConnectService.cashout()` it reads `User.diamondBalance` which is always 0. The inverse is also true: coins purchased via `StripeConnectService.purchaseCoins()` go to `User.coinBalance`, but `GiftsService.sendGift()` checks `CoinBalance.coins` which is empty. **Creators can never cash out gift-earned diamonds. Users can never spend purchased coins on gifts.**

---

## FINDING 2 — CRITICAL: StripeConnectService Not Registered in Any Module
**Severity:** P0 — Dead Code
**File:** `apps/api/src/modules/monetization/monetization.module.ts` (line 1-10)
**Code:**
```typescript
@Module({
  controllers: [MonetizationController],
  providers: [MonetizationService],
  exports: [MonetizationService],
})
export class MonetizationModule {}
```
**Explanation:** `StripeConnectService` exists as a complete implementation (268 lines) with `createConnectedAccount()`, `purchaseCoins()`, `sendGift()`, `cashout()`, and `getRevenueDashboard()` methods. But it is NOT listed in any module's `providers` array — not in `MonetizationModule`, not in any other module. NestJS will never instantiate it. No controller routes to it. The entire Stripe Connect onboarding flow, the `User.coinBalance`/`User.diamondBalance` path, and the `CreatorEarning` tracking are dead code. The `cashout()` method with Stripe transfer integration, the only path that actually sends money to creators, is unreachable.

---

## FINDING 3 — CRITICAL: Coins Credited Before Payment Confirmation
**Severity:** P0 — Financial
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts` (lines 109-137)
**Code:**
```typescript
async purchaseCoins(userId: string, packageId: string) {
  // ...
  if (this.apiAvailable) {
    // Create payment intent...
    paymentIntentId = pi.id;
  }
  // Credit coins IMMEDIATELY regardless of payment status
  await this.prisma.user.update({
    where: { id: userId },
    data: { coinBalance: { increment: pkg.coins } },
  });
  return { coins: pkg.coins, paymentIntentId };
}
```
**Explanation:** Coins are credited to `User.coinBalance` immediately after creating a PaymentIntent, NOT after payment succeeds. The PaymentIntent is returned to the client for frontend presentation, but the coins are already in the user's balance. If the user cancels the payment sheet, closes the app, or the card is declined, the coins remain credited. This is free money. The comment on line 130 even acknowledges this: `"in production, do this in the webhook after payment succeeds"`. But it was never fixed.

---

## FINDING 4 — CRITICAL: GiftsService.purchaseCoins() Has No Payment Integration At All
**Severity:** P0 — Financial
**File:** `apps/api/src/modules/gifts/gifts.service.ts` (lines 63-87)
**Code:**
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
  await this.prisma.coinTransaction.create({ ... });
  return { coins: balance.coins, diamonds: balance.diamonds };
}
```
**Explanation:** `POST /gifts/purchase` accepts an arbitrary `amount` integer and credits that many coins to the user's `CoinBalance` table instantly with zero payment. No Stripe integration, no payment verification, no cost. Any authenticated user can call `POST /gifts/purchase { amount: 999999999 }` and receive unlimited free coins. These coins can then be sent as gifts. This is the active code path used by the gift-shop.tsx screen.

---

## FINDING 5 — CRITICAL: GiftsService.cashout() Has No Payout Integration
**Severity:** P0 — Financial
**File:** `apps/api/src/modules/gifts/gifts.service.ts` (lines 203-249)
**Code:**
```typescript
async cashout(userId: string, diamonds: number): Promise<CashoutResult> {
  // ... validation ...
  const updated = await this.prisma.coinBalance.updateMany({
    where: { userId, diamonds: { gte: diamonds } },
    data: { diamonds: { decrement: diamonds } },
  });
  await this.prisma.coinTransaction.create({ ... });
  return { diamondsDeducted: diamonds, usdAmount, remainingDiamonds: balance.diamonds - diamonds };
}
```
**Explanation:** The `cashout()` method deducts diamonds from `CoinBalance` and creates a transaction record, but NO actual money is transferred. There is no Stripe transfer, no payout, no bank transfer integration. The method returns `{ usdAmount }` but the user receives $0. The `StripeConnectService.cashout()` which HAS Stripe transfer logic is dead code (Finding 2). The `cashout.tsx` screen calls `/monetization/wallet/cashout` which doesn't even exist (Finding 6).

---

## FINDING 6 — CRITICAL: cashout.tsx Calls Non-Existent API Endpoints
**Severity:** P0 — Screen Completely Broken
**File:** `apps/mobile/app/(screens)/cashout.tsx` (lines 49-59)
**Code:**
```typescript
const walletApi = {
  getBalance: () => api.get<WalletBalance>('/monetization/wallet/balance'),
  getPaymentMethods: () => api.get<PaymentMethod[]>('/monetization/wallet/payment-methods'),
  requestCashout: (payload) => api.post('/monetization/wallet/cashout', payload),
};
```
**Explanation:** The cashout screen calls three endpoints under `/monetization/wallet/` prefix. No such endpoints exist in the backend. The `MonetizationController` (mounted at `/monetization`) has tip and tier endpoints but NO wallet endpoints. The `PaymentsController` (mounted at `/payments`) has payment-methods but not under `/monetization/wallet/`. The `GiftsController` has `/gifts/cashout` and `/gifts/balance` but those are under `/gifts/`, not `/monetization/wallet/`. Every API call on this screen will 404. The cashout feature is entirely non-functional.

---

## FINDING 7 — CRITICAL: send-tip.tsx Does Not Use Stripe Payment (Direct DB Write)
**Severity:** P0 — Financial
**File:** `apps/mobile/app/(screens)/send-tip.tsx` (lines 151-176)
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
}, [creator, tipAmount, message, haptic]);
```
**Backend (monetization.service.ts lines 21-63):**
```typescript
async sendTip(senderId, receiverId, amount, message) {
  // No payment processing at all
  const tip = await this.prisma.tip.create({
    data: { senderId, receiverId, amount, currency: 'USD', message, platformFee, status: 'completed' },
  });
  return tip;
}
```
**Explanation:** The send-tip screen calls `monetizationApi.sendTip()` which hits `POST /monetization/tips`. This directly creates a `Tip` record in the database with `status: 'completed'` — no Stripe PaymentIntent, no card charge, no payment sheet. The user "sends" a tip without paying anything. The `PaymentsService.createPaymentIntent()` which properly creates a Stripe PaymentIntent exists but is never called from this flow. The `usePayment` hook that integrates with Stripe is never imported in any screen.

---

## FINDING 8 — CRITICAL: usePayment Hook Never Used In Any Screen
**Severity:** P0 — Dead Code
**File:** `apps/mobile/src/hooks/usePayment.ts` (all 122 lines)
**Explanation:** `usePayment` is the only hook that properly integrates with Stripe (calls `paymentsApi.createPaymentIntent()`, uses `initPaymentSheet`/`presentPaymentSheet` from `@stripe/stripe-react-native`). However, it is imported by ZERO screens. Searched the entire `apps/mobile/app/` directory for `import.*usePayment` — zero results. Every monetization screen (send-tip, gift-shop, cashout, enable-tips, membership-tiers) bypasses Stripe entirely and writes directly to the database.

---

## FINDING 9 — CRITICAL: paymentsApi.ts Orphaned (Imported Only by Unused Hook)
**Severity:** P0 — Dead Code Chain
**File:** `apps/mobile/src/services/paymentsApi.ts` (all 32 lines)
**Explanation:** `paymentsApi.ts` is only imported by `usePayment.ts` (Finding 8), which is itself imported by nothing. The entire Stripe payment flow on mobile — `createPaymentIntent`, `createSubscription`, `cancelSubscription`, `getPaymentMethods`, `attachPaymentMethod` — is dead code. The `payments.ts` types file exists but is only used by `paymentsApi.ts`. This is a dead code chain: `types/payments.ts` -> `paymentsApi.ts` -> `usePayment.ts` -> nothing.

---

## FINDING 10 — CRITICAL: @stripe/stripe-react-native Not Installed
**Severity:** P0 — Dependency Missing
**File:** `apps/mobile/package.json`
**Explanation:** The `usePayment` hook imports `{ useStripe } from '@stripe/stripe-react-native'`, but searching `package.json` for "stripe" yields zero results. The `@stripe/stripe-react-native` package is not listed in dependencies or devDependencies. Even if `usePayment` were called, it would crash at import time with a module resolution error.

---

## FINDING 11 — CRITICAL: Subscription Tiers Have No Billing Integration
**Severity:** P0 — Feature Broken
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (lines 264-296)
**Code:**
```typescript
async subscribe(tierId: string, userId: string) {
  // ...validation...
  const subscription = await this.prisma.membershipSubscription.upsert({
    where: { tierId_userId: { tierId, userId } },
    update: { status: 'active', startDate: new Date() },
    create: { tierId, userId, status: 'active', startDate: new Date() },
  });
  return subscription;
}
```
**Explanation:** `POST /monetization/subscribe/:tierId` creates an active subscription record in the database with no payment. No Stripe subscription is created. No recurring billing is set up. The `PaymentsService.createSubscription()` which properly creates a Stripe subscription with recurring billing exists but is completely disconnected from the mobile flow. The `membership-tiers.tsx` screen calls `monetizationApi.subscribe(tierId)` which goes to this free endpoint. Creators get "subscribers" who never pay.

---

## FINDING 12 — CRITICAL: Subscription Has No Expiry/Renewal Logic
**Severity:** P1 — Design Flaw
**File:** `apps/api/src/modules/monetization/monetization.service.ts`
**Explanation:** The subscription model has `startDate` and `endDate`, but `endDate` is never set when subscribing (it's null). There is no cron job, no scheduled task, and no webhook handler that checks subscription expiry and auto-renews or cancels. A subscription is "active" forever once created. The `PaymentsService` has `handleInvoicePaid()` that updates `endDate`, but it only fires via Stripe webhook (which requires `STRIPE_WEBHOOK_SECRET` which is EMPTY per CLAUDE.md). Even if it worked, it's disconnected from the `MonetizationService.subscribe()` flow which doesn't create Stripe subscriptions.

---

## FINDING 13 — CRITICAL: No Scheduled Content Auto-Publisher
**Severity:** P1 — Feature Missing
**File:** `apps/api/src/modules/scheduling/scheduling.service.ts`
**Explanation:** The `SchedulingService` provides CRUD operations for scheduling content (setting `scheduledAt` field on posts/threads/reels/videos). But there is NO background worker, cron job, or BullMQ processor that scans for content where `scheduledAt <= now()` and publishes it. Searched the entire `apps/api/src` directory for cron/schedule patterns — only found a test mock. Content can be scheduled but will NEVER auto-publish. The `publishNow()` method (line 159) just sets `scheduledAt = null`, which doesn't actually "publish" — it removes the schedule.

---

## FINDING 14 — HIGH: Tip Amount Uses `number` Type, Schema Uses `Decimal`
**Severity:** P1 — Data Corruption
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (line 23) vs `apps/api/prisma/schema.prisma` (line 2134)
**Code (service):**
```typescript
async sendTip(senderId: string, receiverId: string, amount: number, ...) {
```
**Code (schema):**
```
amount      Decimal  @db.Decimal(12, 2)
```
**Explanation:** The `Tip.amount` column is `Decimal(12,2)` in PostgreSQL, but the service accepts `number` (JavaScript float). The monetization service does `amount * 0.10` for platform fee computation using floating point arithmetic, then stores the result in a Decimal column. This can produce rounding errors. For example, `amount = 10.01` yields `platformFee = 1.001` which truncates to `1.00` in Decimal(12,2), losing $0.001 per tip. At scale, this compounds. The `PaymentsService` correctly rounds with `Math.round(amount * 100)` for Stripe cents, but the `MonetizationService` does not.

---

## FINDING 15 — HIGH: Tip `totalEarned` Reports Gross, Not Net
**Severity:** P1 — Misleading Data
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (lines 123-163)
**Code:**
```typescript
async getTipStats(userId: string) {
  const [totalEarned, ...] = await Promise.all([
    this.prisma.tip.aggregate({
      where: { receiverId: userId },
      _sum: { amount: true },
    }),
    // ...
  ]);
  return { totalEarned: Number(totalEarned._sum.amount || 0), ... };
}
```
**Explanation:** `totalEarned` sums `amount` (the gross tip amount) not `amount - platformFee` (the net amount the creator actually receives). The creator sees their total earned as the full amount sent, but the platform takes 10%. There is a `platformFee` field in each Tip record, but it's never subtracted in the stats. A creator who received $100 in tips would see `totalEarned: $100` but would actually be owed $90.

---

## FINDING 16 — HIGH: enable-tips.tsx Save Is A No-Op (setTimeout Stub)
**Severity:** P1 — Feature Broken
**File:** `apps/mobile/app/(screens)/enable-tips.tsx` (lines 128-141)
**Code:**
```typescript
const handleSave = useCallback(async () => {
  haptic.medium();
  setSubmitting(true);
  try {
    // Tip settings saved locally — backend updateTipSettings endpoint needed for persistence
    await new Promise(resolve => setTimeout(resolve, 300));
    haptic.success();
    Alert.alert(t('common.success'), t('screens.enableTips.saveSuccess'));
  } catch (err) {
    // ...
  }
}, [...]);
```
**Explanation:** The "Save Settings" button on the enable-tips screen does nothing. It shows a 300ms delay then displays "Success" alert, but no API call is made. The settings (isEnabled, minTipAmount, displaySettings, thankYouMessage) are stored only in React state and lost on navigation. The comment on line 132 acknowledges: `"backend updateTipSettings endpoint needed for persistence"`. No such endpoint exists.

---

## FINDING 17 — HIGH: enable-tips.tsx Connect Payment Button Is A Local Toggle
**Severity:** P1 — Feature Broken
**File:** `apps/mobile/app/(screens)/enable-tips.tsx` (lines 143-146)
**Code:**
```typescript
const handleConnectPayment = useCallback(() => {
  haptic.light();
  setIsConnected(!isConnected);
}, [haptic, isConnected]);
```
**Explanation:** The "Connect Payment Method" button in the enable-tips screen toggles a local boolean state. It does not open Stripe Connect onboarding, does not call `StripeConnectService.createConnectedAccount()`, and does not save anything to the backend. The user sees "Connected" / "Ready to receive tips" but nothing is actually connected.

---

## FINDING 18 — HIGH: creator-storefront.tsx Calls Non-Existent `/storefront/` Endpoint
**Severity:** P1 — Screen Broken
**File:** `apps/mobile/app/(screens)/creator-storefront.tsx` (lines 68-69)
**Code:**
```typescript
const [productsRes, profileRes] = await Promise.all([
  api.get(`/storefront/${userId}/products`),
  api.get(`/users/${userId}`),
]);
```
**Explanation:** There is no `/storefront/` controller or endpoint anywhere in the backend. Searching for `'/storefront/'` across all backend modules yields zero results. The `api.get('/storefront/${userId}/products')` call will always 404. The creator-storefront screen will always show an empty product list.

---

## FINDING 19 — HIGH: creator-dashboard.tsx Revenue Tab Has Wrong API Response Shape
**Severity:** P1 — UI Data Mismatch
**File:** `apps/mobile/app/(screens)/creator-dashboard.tsx` (lines 101-108) vs `apps/api/src/modules/creator/creator.service.ts` (lines 218-251)
**Mobile expects:**
```typescript
interface RevenueData {
  total: string;
  tips: string;
  memberships: string;
  history: { month: string; amount: number }[];
}
```
**Backend returns:**
```typescript
return {
  tips: { total: Number(tips._sum.amount ?? 0), count: tips._count },
  memberships: { total: membershipTotal, count: membershipIncome },
};
```
**Explanation:** The mobile expects `{ total, tips, memberships, history }` where `total`, `tips`, `memberships` are strings like `"$1,234.56"`, and `history` is an array of monthly data. The backend returns `{ tips: { total, count }, memberships: { total, count } }` — no `total` field, no `history` array, and values are numbers not formatted strings. The revenue tab will render with all zeros/nulls.

---

## FINDING 20 — HIGH: CreatorService Has Duplicate getAudienceDemographics Methods
**Severity:** P1 — Compilation/Runtime Error
**File:** `apps/api/src/modules/creator/creator.service.ts` (lines 130-150 and 255-291)
**Code:**
```typescript
// First definition (line 130) — takes userId, queries Follow table
async getAudienceDemographics(userId: string) { ... }

// Second definition (line 255) — takes channelId, queries ViewerDemographic table
async getAudienceDemographics(channelId: string) { ... }
```
**Explanation:** The same method name `getAudienceDemographics` is defined twice in the same class with different implementations. In TypeScript, the second definition silently overrides the first. The controller at line 56-57 calls `this.creatorService.getAudienceDemographics(userId)` which invokes the second (channelId-based) version, passing a userId where a channelId is expected. This queries `ViewerDemographic` table filtered by `channelId = userId` which will likely return zero results because those are different ID domains.

---

## FINDING 21 — HIGH: Monetization DTOs Use Inline Classes Without Validation
**Severity:** P1 — Input Validation Bypass
**File:** `apps/api/src/modules/monetization/monetization.controller.ts` (lines 20-39)
**Code:**
```typescript
class CreateTipDto {
  receiverId: string;
  amount: number;
  message?: string;
}
class CreateTierDto {
  name: string;
  price: number;
  benefits: string[];
  level?: string;
}
```
**Explanation:** All DTOs in the monetization controller are plain classes with no `class-validator` decorators (`@IsString()`, `@IsNumber()`, `@IsNotEmpty()`, `@MaxLength()`, etc.). NestJS `ValidationPipe` requires these decorators to enforce validation. Without them, ANY payload shape is accepted. An attacker can send `{ amount: "not_a_number", receiverId: null }` and it will pass through to the service where Prisma may throw an unstructured error or worse, store corrupted data.

---

## FINDING 22 — HIGH: Gifts DTOs Also Lack All Validation
**Severity:** P1 — Input Validation Bypass
**File:** `apps/api/src/modules/gifts/gifts.controller.ts` (lines 17-31)
**Code:**
```typescript
class PurchaseCoinsDto {
  amount: number;
}
class SendGiftDto {
  receiverId: string;
  giftType: string;
  contentId?: string;
  contentType?: string;
}
class CashoutDto {
  diamonds: number;
}
```
**Explanation:** Same issue as Finding 21. No `class-validator` decorators on any field. `PurchaseCoinsDto.amount` can be any type (string, array, object). The service does `Number.isInteger(amount)` check but this fails silently for string inputs that look like numbers (e.g., `"100"` would pass `parseInt` but not `Number.isInteger`).

---

## FINDING 23 — HIGH: Payments DTOs Also Lack All Validation
**Severity:** P1 — Input Validation Bypass
**File:** `apps/api/src/modules/payments/payments.controller.ts` (lines 21-34)
**Code:**
```typescript
class CreatePaymentIntentDto {
  amount: number;
  currency: string;
  receiverId: string;
}
class CreateSubscriptionDto {
  tierId: string;
  paymentMethodId: string;
}
class AttachPaymentMethodDto {
  paymentMethodId: string;
}
```
**Explanation:** No validation decorators. The `currency` field accepts any string — no whitelist against supported currencies. The `amount` field has no minimum/maximum constraints at the DTO level. The `paymentMethodId` could be any string, with Stripe being the only defense.

---

## FINDING 24 — HIGH: cashout.tsx Has Duplicate Pressable Import
**Severity:** P2 — Build Warning / Potential Crash
**File:** `apps/mobile/app/(screens)/cashout.tsx` (lines 8, 10)
**Code:**
```typescript
import {
  // ...
  Pressable,
  ScrollView,
  Alert,
  Pressable,  // Duplicate!
} from 'react-native';
```
**Explanation:** `Pressable` is imported twice in the same destructuring. While JavaScript/TypeScript ignores duplicate named imports, some build tools or linters may warn or fail. Same issue in `creator-storefront.tsx` (lines 8, 11) and `creator-dashboard.tsx` (lines 11, 12).

---

## FINDING 25 — HIGH: gift-shop.tsx Has Syntax Error (Missing Closing Brace)
**Severity:** P2 — Build Error
**File:** `apps/mobile/app/(screens)/gift-shop.tsx` (line 3)
**Code:**
```typescript
import {
  View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ScrollView,
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
```
**Explanation:** The `import { ... } from 'react-native'` statement is missing its closing brace `}` and the `from 'react-native'` clause. The next `import` statement starts on the same line. This is a syntax error that would prevent the file from compiling. Either Metro bundler is somehow recovering, or this screen has never been successfully loaded.

---

## FINDING 26 — HIGH: Stripe Webhook Secret Empty = Payment Events Never Processed
**Severity:** P1 — Integration Dead
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts` (lines 48-52)
**Code:**
```typescript
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
  throw new BadRequestException('Webhook secret not configured');
}
```
**Explanation:** Per CLAUDE.md credential status, `STRIPE_WEBHOOK_SECRET` is EMPTY. Even if the `PaymentsService` proper Stripe flow were used, the webhook endpoint would reject all incoming Stripe events with 400. This means:
1. `payment_intent.succeeded` never fires — tips stay "pending" forever
2. `invoice.paid` never fires — subscriptions never extend
3. `customer.subscription.deleted` never fires — cancelled subscriptions stay "active" locally
The entire payments webhook pipeline is dead.

---

## FINDING 27 — HIGH: MonetizationService.sendTip() Does Not Check Sender Balance
**Severity:** P1 — Financial
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (lines 21-63)
**Explanation:** The `sendTip()` method creates a Tip record with `status: 'completed'` but never checks if the sender has sufficient funds, a payment method, or any form of payment. It just creates a database record. The `getTipStats()` method then reports this as real earnings for the receiver. Tips are effectively free — any user can "tip" any amount up to $10,000 with no actual payment.

---

## FINDING 28 — HIGH: Gift History Returns CoinTransaction, Not GiftRecord
**Severity:** P2 — Wrong Data
**File:** `apps/api/src/modules/gifts/gifts.service.ts` (lines 178-201) vs `apps/mobile/src/services/giftsApi.ts` (lines 26-32)
**Backend returns:**
```typescript
// CoinTransaction fields: id, userId, type, amount, description, createdAt
```
**Mobile expects:**
```typescript
interface GiftHistoryItem {
  id: string;
  giftType: string;
  coins: number;
  senderId: string;
  receiverId: string;
  createdAt: string;
  senderName?: string;
  receiverName?: string;
}
```
**Explanation:** The `/gifts/history` endpoint returns `CoinTransaction` records which have `type`, `amount`, `description` fields. The mobile expects `GiftHistoryItem` with `giftType`, `coins`, `senderId`, `receiverId`, `senderName`, `receiverName`. These don't match. The history tab in gift-shop.tsx will render with undefined values for giftType, senderId, etc.

---

## FINDING 29 — HIGH: giftsApi.getReceived() Calls Wrong Endpoint
**Severity:** P2 — API Mismatch
**File:** `apps/mobile/src/services/giftsApi.ts` (line 43)
**Code:**
```typescript
getReceived: (userId: string) => api.get<GiftHistoryItem[]>(`/gifts/received/${userId}`),
```
**Backend (gifts.controller.ts line 104-109):**
```typescript
@Get('received')
getReceivedGifts(@CurrentUser('id') userId: string) {
  return this.giftsService.getReceivedGifts(userId);
}
```
**Explanation:** The mobile calls `/gifts/received/${userId}` passing a userId in the URL. The backend has `/gifts/received` (no parameter) and extracts userId from the auth token via `@CurrentUser('id')`. The mobile request will hit a non-existent route or match a different handler. Also, the backend returns aggregated gift data (grouped by type with counts), not individual `GiftHistoryItem` records.

---

## FINDING 30 — HIGH: Coin Package Prices Mismatch Between Backend and Mobile
**Severity:** P2 — UX Confusing
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts` (lines 97-103) vs `apps/mobile/app/(screens)/gift-shop.tsx` (lines 24-29)
**Backend packages:**
```
small: 100 coins = $0.99
medium: 500 coins = $4.99
large: 1200 coins = $9.99
xl: 5000 coins = $39.99
xxl: 10000 coins = $69.99
```
**Mobile packages:**
```
100 coins = $0.99
500 coins = $4.99
1000 coins = $9.99
5000 coins = $49.99
```
**Explanation:** The coin packages differ between backend and mobile:
- Backend has 1200 coins for $9.99, mobile shows 1000 coins for $9.99
- Backend has xxl (10000 coins for $69.99), mobile doesn't have it
- Backend xl is $39.99, mobile shows $49.99 for the same 5000 coins
- Mobile only has 4 packages, backend has 5
This is moot since the `GiftsService.purchaseCoins()` (the active path) doesn't use packages at all — it takes an arbitrary `amount` integer.

---

## FINDING 31 — HIGH: Diamonds-to-USD Rate Inconsistency
**Severity:** P2 — Financial Mismatch
**File:** Multiple locations
**Location 1 — GiftsService (line 40):** `const DIAMONDS_PER_USD_CENT = 100 / 70;` → 100 diamonds = $0.70
**Location 2 — StripeConnectService (line 197):** `const amountUsd = diamondAmount * 0.01;` → 100 diamonds = $1.00
**Location 3 — cashout.tsx (line 63):** `const DIAMOND_TO_USD = 0.007;` → 100 diamonds = $0.70
**Location 4 — StripeConnectService (line 18):** `PLATFORM_FEE_PERCENT = 30` → 70/30 split
**Location 5 — MonetizationService (line 36):** `platformFee = amount * 0.10` → 10% platform fee

**Explanation:** The diamond-to-USD rate is inconsistent. `GiftsService` and `cashout.tsx` agree on 100 diamonds = $0.70. But `StripeConnectService.cashout()` uses `diamondAmount * 0.01` which means 100 diamonds = $1.00 — a 43% discrepancy. Also, the platform fee is 10% in tips (`MonetizationService`) but 30% in the connect service (`StripeConnectService`). There's no single source of truth for conversion rates.

---

## FINDING 32 — MEDIUM: creatorApi Endpoints Don't Match Backend Response Shape
**Severity:** P2 — Data Mismatch
**File:** `apps/mobile/src/services/creatorApi.ts` (lines 33-35)
**Code:**
```typescript
getOverview: () => api.get<OverviewData>('/creator/analytics/overview'),
```
**Mobile OverviewData expects:** `{ views, viewsChange, followers, followersChange, engagement, engagementChange, revenue, revenueChange }`
**Backend returns:** `{ followers, totalPosts, totalLikes, totalViews, totalComments, engagementRate, revenue }`
**Explanation:** The mobile expects `viewsChange`, `followersChange`, `engagementChange`, `revenueChange` (percentage changes) but the backend returns `totalViews`, `totalLikes`, `totalComments` — no change metrics. The overview cards in creator-dashboard.tsx will show "0%" or "NaN%" for all change values.

---

## FINDING 33 — MEDIUM: send-tip.tsx Platform Fee Added ON TOP, Not Deducted From Tip
**Severity:** P2 — UX Design Issue
**File:** `apps/mobile/app/(screens)/send-tip.tsx` (lines 141-143)
**Code:**
```typescript
const platformFee = tipAmount * PLATFORM_FEE_PERCENT; // 10%
const total = tipAmount + platformFee;
```
**Backend (monetization.service.ts line 36-37):**
```typescript
const platformFee = amount * 0.10;
const netAmount = amount - platformFee;
```
**Explanation:** The mobile shows the platform fee as an addition on top of the tip (sender pays $5 tip + $0.50 fee = $5.50 total). The backend deducts the fee from the tip amount (creator receives $5 - $0.50 = $4.50 net). These are contradictory models. The mobile implies the sender pays extra; the backend implies the receiver gets less. Since tips currently work without payment (Finding 7), neither matters — but if real payments are ever connected, the amounts won't match.

---

## FINDING 34 — MEDIUM: StripeConnectService Uses Raw `fetch()` Instead of Stripe SDK
**Severity:** P2 — Code Quality / Error Handling
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts` (lines 44-84, 112-128, 208-221)
**Explanation:** The `StripeConnectService` makes raw `fetch()` calls to `https://api.stripe.com/v1/...` with URL-encoded form bodies, instead of using the `stripe` npm package that's already installed and used in `PaymentsService`. This means:
1. No automatic retry on network errors
2. No TypeScript type safety for request/response
3. No proper error parsing (Stripe errors have specific structure)
4. No idempotency key handling
5. No automatic API version management
6. Response errors are not checked — `response.json()` is called without checking `response.ok`

---

## FINDING 35 — MEDIUM: StripeConnectService.createConnectedAccount() No Error Handling on Stripe Response
**Severity:** P2 — Runtime Crash
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts` (lines 44-84)
**Code:**
```typescript
const response = await fetch('https://api.stripe.com/v1/accounts', { ... });
const account = await response.json();
const accountId = account.id;
// No check if response.ok or if account.id exists
await this.prisma.user.update({ ... data: { stripeConnectAccountId: accountId } });
```
**Explanation:** If the Stripe API returns an error (4xx/5xx), `account.id` will be `undefined`. The code then stores `undefined` as `stripeConnectAccountId` in the user record and proceeds to create an account link with `account: undefined` which will also fail. No error handling, no null check, no response status validation.

---

## FINDING 36 — MEDIUM: StripeConnectService.cashout() Deducts Diamonds Before Verifying Transfer
**Severity:** P1 — Financial
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts` (lines 200-222)
**Code:**
```typescript
// Deduct diamonds FIRST
await this.prisma.user.update({
  where: { id: userId },
  data: { diamondBalance: { decrement: diamondAmount } },
});
// THEN try transfer (which might fail)
if (this.apiAvailable && user.stripeConnectAccountId) {
  await fetch('https://api.stripe.com/v1/transfers', { ... });
}
```
**Explanation:** Diamonds are deducted from the user's balance BEFORE the Stripe transfer is attempted. If the transfer fails (network error, insufficient Stripe balance, invalid connected account), the diamonds are already gone but no money was sent. There's no rollback on transfer failure. The transfer response is not even checked — `await fetch(...)` with no result handling.

---

## FINDING 37 — MEDIUM: GiftsService.cashout() remainingDiamonds Can Be Stale
**Severity:** P2 — Race Condition
**File:** `apps/api/src/modules/gifts/gifts.service.ts` (lines 214-248)
**Code:**
```typescript
const balance = await this.prisma.coinBalance.findUnique({ where: { userId } });
// ... time passes ...
const updated = await this.prisma.coinBalance.updateMany({
  where: { userId, diamonds: { gte: diamonds } },
  data: { diamonds: { decrement: diamonds } },
});
// ...
return { remainingDiamonds: balance.diamonds - diamonds };
```
**Explanation:** `balance` is read at the start, then `updateMany` is used with a conditional check (good for preventing negative). But `remainingDiamonds` in the return is computed from the stale `balance.diamonds` snapshot, not from the actual updated row. If another concurrent cashout request processed between the read and update, the returned `remainingDiamonds` will be wrong. Should read the updated balance after the update.

---

## FINDING 38 — MEDIUM: No Minimum Tip Amount Enforcement
**Severity:** P2 — Spam Vector
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (line 23)
**Code:**
```typescript
if (amount <= 0 || amount > 10000) {
  throw new BadRequestException('Tip amount must be between $0.01 and $10,000');
}
```
**Explanation:** The validation says "between $0.01 and $10,000" but the check is `amount <= 0` which means $0.001 would pass. There's no actual $0.01 minimum enforced. With zero-cost tips (Finding 7), a user could spam millions of $0.001 tips to inflate `getTipStats()` for any creator. Even with real payments, Stripe's minimum is typically $0.50 for credit cards.

---

## FINDING 39 — MEDIUM: MonetizationService.getTipStats() N+1 Query for Top Supporters
**Severity:** P2 — Performance
**File:** `apps/api/src/modules/monetization/monetization.service.ts` (lines 146-157)
**Code:**
```typescript
const supporterDetails = await Promise.all(
  topSupporters.map(async (supporter) => {
    const user = await this.prisma.user.findUnique({
      where: { id: supporter.senderId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    return { user, totalAmount: Number(supporter._sum.amount || 0) };
  }),
);
```
**Explanation:** After the `groupBy` query returns up to 5 top supporters, each supporter's user details are fetched individually in a `Promise.all` loop — 5 separate database queries. Should use a single `findMany` with `where: { id: { in: senderIds } }` to batch this into one query.

---

## FINDING 40 — MEDIUM: Tip.message Field Used for Stripe Metadata Storage
**Severity:** P2 — Data Corruption
**File:** `apps/api/src/modules/payments/payments.service.ts` (lines 149-159)
**Code:**
```typescript
const tip = await this.prisma.tip.create({
  data: {
    // ...
    message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'pending' }),
    // ...
  },
});
```
**Explanation:** The `PaymentsService` stores Stripe metadata as JSON in the `Tip.message` field, which is meant for user-facing tip messages (VarChar(500)). When the webhook updates the tip, it overwrites the message with more JSON. If a user included a personal message with their tip, it would be lost. The Tip model should have a separate field for payment metadata.

---

## FINDING 41 — MEDIUM: PaymentsService Webhook Handlers Use Redis-Only Mapping
**Severity:** P2 — Data Loss Risk
**File:** `apps/api/src/modules/payments/payments.service.ts` (lines 75-77, 353-374)
**Code:**
```typescript
private async storePaymentIntentMapping(paymentIntentId: string, tipId: string) {
  await this.redis.setex(`payment_intent:${paymentIntentId}`, 60 * 60 * 24 * 7, tipId);
}
```
**Explanation:** Payment intent-to-tip and subscription-to-subscription mappings are stored ONLY in Redis with TTLs (7 days for payments, 30 days for subscriptions). If Redis restarts, all mappings are lost. Stripe webhooks may fire days later (e.g., after a dispute) and find no mapping, silently failing. These mappings should be persisted in PostgreSQL with Redis as a cache.

---

## FINDING 42 — MEDIUM: PaymentsService Handles Stripe Cancel by Continuing Local Cancel
**Severity:** P2 — Inconsistency
**File:** `apps/api/src/modules/payments/payments.service.ts` (lines 297-304)
**Code:**
```typescript
try {
  await this.stripe.subscriptions.cancel(stripeSubscriptionId);
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  this.logger.error(`Stripe subscription cancel failed: ${msg}`);
  // Continue with local cancellation even if Stripe fails
}
```
**Explanation:** If the Stripe subscription cancel fails (e.g., already cancelled, network error), the local subscription is still marked as "cancelled". But the Stripe subscription may still be active and billing the user. This creates a split state: locally cancelled, Stripe still charging. Should at minimum log a critical alert and retry.

---

## FINDING 43 — MEDIUM: creator-dashboard.tsx getAudience() Calls Wrong Backend Method
**Severity:** P2 — Wrong Data
**File:** `apps/mobile/src/services/creatorApi.ts` (line 36) vs `apps/api/src/modules/creator/creator.controller.ts` (line 56)
**Mobile calls:** `GET /creator/analytics/audience`
**Controller routes to:** `creatorService.getAudienceDemographics(userId)`
**Which resolves to the SECOND definition** (line 255 in creator.service.ts) that queries `ViewerDemographic` by `channelId`, not `userId`.
**Mobile expects:**
```typescript
interface AudienceData {
  ageGroups: { range: string; percentage: number }[];
  topCountries: { name: string; percentage: number }[];
  genderSplit: { male: number; female: number; other: number };
}
```
**Backend second method returns:**
```typescript
{ countries: [...], ageRanges: [...], genders: [...], sources: [...] }
```
**Explanation:** Field names don't match (`countries` vs `topCountries`, `ageRanges` vs `ageGroups`, `genders` vs `genderSplit`). Also the backend returns counts, not percentages. The audience tab will render empty.

---

## FINDING 44 — LOW: gift-shop.tsx "Buy" Button Sends Arbitrary Coin Amount
**Severity:** P2 — Incorrect Integration
**File:** `apps/mobile/app/(screens)/gift-shop.tsx` (lines 101-103)
**Code:**
```typescript
const handleBuyCoins = (amount: number) => {
  haptic.medium();
  purchaseMutation.mutate(amount);
};
```
**Explanation:** The "Buy" button sends the coin count (100, 500, 1000, 5000) as the `amount` to `POST /gifts/purchase`. The backend `purchaseCoins()` interprets this as "give this many coins for free" (Finding 4). The displayed price ($0.99, $4.99, etc.) is purely cosmetic — no payment is collected.

---

## FINDING 45 — LOW: gift-shop.tsx Cashout Only Has "Cash Out All" Option
**Severity:** P3 — UX Limitation
**File:** `apps/mobile/app/(screens)/gift-shop.tsx` (lines 117-121)
**Code:**
```typescript
const handleCashout = () => {
  if (balance && balance.diamonds > 0) {
    cashoutMutation.mutate(balance.diamonds);
  }
};
```
**Explanation:** The cashout bottom sheet only has a "Cash Out All" button. There's no way to cash out a partial amount. The cashout.tsx screen has a proper amount input but calls non-existent endpoints (Finding 6). So the only working cashout path is "all or nothing" from the gift shop — and even that doesn't actually pay out (Finding 5).

---

## FINDING 46 — LOW: membership-tiers.tsx Subscribe Flow Has No Payment
**Severity:** P2 — Already covered by Finding 11
**File:** `apps/mobile/app/(screens)/membership-tiers.tsx` (line 24)
**Code:** `import { monetizationApi } from '@/services/monetizationApi';`
**Explanation:** The membership-tiers screen uses `monetizationApi.subscribe(tierId)` which calls `POST /monetization/subscribe/:tierId`. This creates a free subscription (Finding 11). The screen shows tier prices ($X/month) but subscribing costs nothing.

---

## FINDING 47 — LOW: No Creator Eligibility Check for Monetization
**Severity:** P3 — Missing Feature
**Files:** All monetization controllers
**Explanation:** There is no concept of "creator program" eligibility. Any user can:
- Create membership tiers (`POST /monetization/tiers`)
- Receive tips (any user can be tipped)
- Cash out diamonds
- Access creator dashboard

Real platforms require minimum follower counts, content history, identity verification, and tax information before enabling monetization. There's no `isCreator` flag, no eligibility check, no onboarding flow.

---

## SUMMARY: End-to-End Flow Analysis

### Can a creator actually earn money and withdraw it?

**NO.** Here is the complete breakdown:

**Path 1: Tips (send-tip.tsx -> monetizationApi.sendTip -> MonetizationService)**
- Sender "sends" a tip
- Backend creates a Tip record with `status: 'completed'` and NO payment
- Creator sees the tip in `getReceivedTips()` and `getTipStats()`
- No money was ever collected
- **Result: Creator sees earnings but received $0**

**Path 2: Gifts (gift-shop.tsx -> giftsApi.purchaseCoins -> GiftsService)**
- User "buys" coins via `POST /gifts/purchase` — coins credited for free
- User sends gift to creator — coins deducted, diamonds credited to `CoinBalance.diamonds`
- Creator tries to cash out via gift-shop "Cash Out All"
- `GiftsService.cashout()` deducts diamonds from `CoinBalance.diamonds`, creates a transaction record
- No actual money is transferred
- **Result: Diamonds vanish, creator receives $0**

**Path 3: Cashout screen (cashout.tsx -> walletApi)**
- All three API calls hit non-existent endpoints (404)
- **Result: Screen loads empty, nothing works**

**Path 4: Stripe Connect (StripeConnectService)**
- Not registered in any module — completely dead code
- Has the only actual Stripe transfer logic
- **Result: Unreachable**

**Path 5: PaymentsService (proper Stripe integration)**
- Has createPaymentIntent, createSubscription, webhook handlers
- usePayment hook properly calls these endpoints
- But usePayment is imported by zero screens
- @stripe/stripe-react-native not even installed
- STRIPE_WEBHOOK_SECRET is empty
- **Result: Complete, correct implementation that nothing uses**

### Key Metrics
| Metric | Value |
|--------|-------|
| Total monetization backend modules | 4 (monetization, gifts, payments, creator) |
| Modules with working payment integration | 0 |
| Mobile screens calling real payment APIs | 0 |
| Dead code files in payment chain | 4 (paymentsApi.ts, usePayment.ts, types/payments.ts, stripe-connect.service.ts) |
| DTOs with validation decorators | 0 of 9 |
| Endpoints that collect real money | 0 |
| Endpoints that pay out real money | 0 |
| Balance systems that don't sync | 2 (User.coinBalance vs CoinBalance.coins) |
