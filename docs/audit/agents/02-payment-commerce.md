# Audit Agent #2: Payment/Commerce/Monetization

**Auditor:** Claude Opus 4.6 (1M context) — Agent #2 of 57
**Date:** 2026-03-21
**Scope:** All payment, commerce, monetization, gifting, tipping, subscriptions, zakat, waqf, treasury, premium, and Stripe integration code.

## Files Audited (line by line)

| File | Lines | Findings |
|------|-------|----------|
| `apps/api/src/modules/gifts/gifts.service.ts` | 276 | 8 |
| `apps/api/src/modules/gifts/gifts.controller.ts` | 111 | 4 |
| `apps/api/src/modules/gifts/gifts.module.ts` | 11 | 0 |
| `apps/api/src/modules/monetization/monetization.service.ts` | 360 | 8 |
| `apps/api/src/modules/monetization/monetization.controller.ts` | 197 | 5 |
| `apps/api/src/modules/monetization/monetization.module.ts` | 10 | 1 |
| `apps/api/src/modules/monetization/stripe-connect.service.ts` | 269 | 10 |
| `apps/api/src/modules/monetization/stripe-connect.service.spec.ts` | 139 | 2 |
| `apps/api/src/modules/commerce/commerce.service.ts` | 342 | 12 |
| `apps/api/src/modules/commerce/commerce.controller.ts` | 171 | 3 |
| `apps/api/src/modules/commerce/dto/commerce.dto.ts` | 83 | 3 |
| `apps/api/src/modules/commerce/commerce.module.ts` | 13 | 0 |
| `apps/api/src/modules/payments/payments.service.ts` | 420 | 6 |
| `apps/api/src/modules/payments/payments.controller.ts` | 100 | 4 |
| `apps/api/src/modules/payments/stripe-webhook.controller.ts` | 91 | 3 |
| `apps/api/src/modules/payments/payments.module.ts` | 14 | 0 |
| `apps/api/src/modules/community/community.service.ts` (waqf section) | ~30 | 3 |
| Prisma schema (all commerce models) | ~350 | 3 |

**Total Findings: 75**
- Critical: 16
- Moderate: 31
- Minor: 28

---

## CRITICAL FINDINGS (16)

### C-01: Coins credited without any payment verification (FREE MONEY)
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 63-87
**Severity:** Critical
**Category:** Security / Financial Fraud

The `purchaseCoins()` method directly increments the user's coin balance without any payment verification. There is no Stripe charge, no payment intent, no receipt — just a POST request that gives unlimited free coins.

```typescript
async purchaseCoins(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestException('Amount must be a positive integer');
  }
  // CRITICAL: Coins credited immediately with zero payment
  const balance = await this.prisma.coinBalance.upsert({
    where: { userId },
    update: { coins: { increment: amount } },
    create: { userId, coins: amount, diamonds: 0 },
  });
```

**Impact:** Any authenticated user can call `POST /gifts/purchase` with `{amount: 999999999}` and receive unlimited free coins, which convert to diamonds, which convert to real USD via cashout. This is a direct financial exploit.

---

### C-02: Dual/split balance systems — coins and diamonds tracked in TWO places
**File:** `apps/api/prisma/schema.prisma` lines 267-268 (User model) and lines 2357-2368 (CoinBalance model)
**Severity:** Critical
**Category:** Data Integrity

The User model has `coinBalance Int` and `diamondBalance Int` fields, while a separate `CoinBalance` model has `coins Int` and `diamonds Int` fields. Two completely independent balance systems exist:

- `gifts.service.ts` reads/writes from `prisma.coinBalance` (CoinBalance model)
- `stripe-connect.service.ts` reads/writes from `prisma.user` (User model fields)

The `sendGift` in `stripe-connect.service.ts` (line 151) checks `sender.coinBalance` on the User model, but the `gifts.service.ts` `sendGift` (line 112) checks `prisma.coinBalance` — a completely different table.

**Impact:** A user can have coins in one system but not the other. Gift operations from one service don't affect the other. Balance reporting is incoherent. A user could potentially spend the same coins twice through different code paths.

---

### C-03: StripeConnectService is completely dead code — not registered in any module
**File:** `apps/api/src/modules/monetization/monetization.module.ts` (all 10 lines)
**Severity:** Critical
**Category:** Dead Code / Missing Feature

The `MonetizationModule` only registers `MonetizationService`. The `StripeConnectService` is never imported, never provided, and never injected anywhere in the application. It exists as 269 lines of unreachable code.

```typescript
@Module({
  controllers: [MonetizationController],
  providers: [MonetizationService], // StripeConnectService NOT listed
  exports: [MonetizationService],
})
export class MonetizationModule {}
```

**Impact:** All Stripe Connect functionality — creator onboarding, coin purchase via Stripe, gift sending via Stripe, cashout to bank, revenue dashboard — is completely non-functional. No module can inject `StripeConnectService`.

---

### C-04: Tips created with status "completed" without any actual payment
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 39-57
**Severity:** Critical
**Category:** Security / Financial Fraud

The `sendTip()` method immediately creates a Tip record with `status: 'completed'` — no Stripe charge, no payment verification, no billing at all. Anyone can "tip" any amount with zero financial settlement.

```typescript
const tip = await this.prisma.tip.create({
  data: {
    senderId, receiverId, amount,
    currency: 'USD', message,
    platformFee,
    status: 'completed', // Marked as completed with no payment!
  },
```

**Impact:** Tips appear as real money but nothing actually transfers. Combined with `getTipStats()`, creators see phantom revenue. The `totalEarned` aggregation (line 126-129) sums these phantom tips as real earnings.

---

### C-05: Subscriptions activated without any payment
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 264-296
**Severity:** Critical
**Category:** Security / Financial Fraud

The `subscribe()` method creates an active membership subscription with no billing whatsoever. Users get full subscription benefits for free.

```typescript
async subscribe(tierId: string, userId: string) {
  // ... validation ...
  const subscription = await this.prisma.membershipSubscription.upsert({
    where: { tierId_userId: { tierId, userId } },
    update: { status: 'active', startDate: new Date() },
    create: { tierId, userId, status: 'active', startDate: new Date() },
  });
  return subscription; // Active subscription, zero payment
}
```

**Impact:** All membership tiers are free. The payments module (`payments.service.ts`) has proper Stripe subscription creation, but the monetization module bypasses it entirely.

---

### C-06: Premium subscription activated without payment
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 319-331
**Severity:** Critical
**Category:** Security / Financial Fraud

`subscribePremium()` creates an active premium subscription with no payment. The `PremiumSubscription` model has a `stripeSubId` field but it's never populated.

```typescript
async subscribePremium(userId: string, plan: string) {
  // No payment, no Stripe, just activate immediately
  return this.prisma.premiumSubscription.upsert({
    where: { userId },
    create: { userId, plan, status: 'active', endDate },
    update: { plan, status: 'active', endDate, autoRenew: true },
  });
}
```

---

### C-07: Cashout deducts diamonds before Stripe transfer — no rollback on failure
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 200-222
**Severity:** Critical
**Category:** Data Integrity / Financial

Diamonds are deducted from the user's balance BEFORE the Stripe transfer is attempted. If the Stripe API call fails (network error, invalid account, insufficient platform balance), the diamonds are lost.

```typescript
// Deduct diamonds FIRST
await this.prisma.user.update({
  where: { id: userId },
  data: { diamondBalance: { decrement: diamondAmount } },
});

// THEN try Stripe transfer — no rollback if this fails
if (this.apiAvailable && user.stripeConnectAccountId) {
  await fetch('https://api.stripe.com/v1/transfers', { ... });
  // No error handling on the fetch response!
}
```

Additionally, the `fetch()` response is never checked for errors (HTTP 400/500 from Stripe is silently ignored).

---

### C-08: Gifts service sendGift has race condition on balance check vs decrement
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 112-163
**Severity:** Critical
**Category:** Data Integrity / Race Condition

The balance check (line 112-117) is done outside the `$transaction`, meaning two concurrent gift sends can both pass the check and then both decrement, resulting in a negative balance. The `$transaction` array form in Prisma doesn't hold row-level locks on the `coinBalance.findUnique`.

```typescript
// Balance check OUTSIDE the transaction — TOCTOU race
const senderBalance = await this.prisma.coinBalance.findUnique({
  where: { userId: senderId },
});
if (!senderBalance || senderBalance.coins < catalogItem.coins) {
  throw new BadRequestException('Insufficient coins');
}

// Transaction doesn't re-check balance
const [giftRecord] = await this.prisma.$transaction([
  // ... decrement without gte check ...
  this.prisma.coinBalance.update({
    where: { userId: senderId },
    data: { coins: { decrement: catalogItem.coins } },
  }),
```

**Impact:** Two fast concurrent requests can spend the same coins twice, driving the sender's balance negative.

**Note:** The `cashout()` method (line 226) correctly uses `updateMany` with a `gte` check — this pattern should be applied to `sendGift` as well.

---

### C-09: Inline DTOs bypass all class-validator validation
**File:** `apps/api/src/modules/gifts/gifts.controller.ts`, lines 17-30
**File:** `apps/api/src/modules/monetization/monetization.controller.ts`, lines 20-39
**File:** `apps/api/src/modules/payments/payments.controller.ts`, lines 21-34
**Severity:** Critical
**Category:** Security / Input Validation

Three controllers define DTOs as plain classes without any `class-validator` decorators. NestJS's `ValidationPipe` (if enabled globally) will NOT validate these because they have no decorators — any value passes through.

**Gifts controller (3 DTOs, 0 decorators):**
```typescript
class PurchaseCoinsDto { amount: number; }
class SendGiftDto { receiverId: string; giftType: string; contentId?: string; contentType?: string; }
class CashoutDto { diamonds: number; }
```

**Monetization controller (3 DTOs, 0 decorators):**
```typescript
class CreateTipDto { receiverId: string; amount: number; message?: string; }
class CreateTierDto { name: string; price: number; benefits: string[]; level?: string; }
class UpdateTierDto { name?: string; price?: number; ... }
```

**Payments controller (3 DTOs, 0 decorators):**
```typescript
class CreatePaymentIntentDto { amount: number; currency: string; receiverId: string; }
class CreateSubscriptionDto { tierId: string; paymentMethodId: string; }
class AttachPaymentMethodDto { paymentMethodId: string; }
```

**Impact:** Any JSON body is accepted. `amount` can be a string, negative, or `NaN`. `receiverId` can be an empty string. `giftType` can be 100MB of garbage. `currency` is unvalidated. Combined with C-01, attackers can craft malicious requests.

---

### C-10: No maximum amount validation on coin purchase
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 63-66
**Severity:** Critical
**Category:** Security / Abuse

The `purchaseCoins` method only checks that `amount` is a positive integer. There is no maximum. A user can request `amount: 2147483647` (max Int32) which would work since `coinBalance.coins` is a Prisma `Int`.

```typescript
if (!Number.isInteger(amount) || amount <= 0) {
  throw new BadRequestException('Amount must be a positive integer');
}
// No upper bound check — unlimited coins
```

Combined with C-01 (no payment), this allows creating arbitrary coin balances.

---

### C-11: Stripe Connect uses raw fetch() without error handling
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 44-84
**Severity:** Critical
**Category:** Error Handling / Financial

All Stripe API calls use raw `fetch()` without checking response status codes. A Stripe error (400, 401, 402, 500) returns a JSON error body but the code treats it as a success.

```typescript
const response = await fetch('https://api.stripe.com/v1/accounts', { ... });
const account = await response.json(); // Could be an error object!
const accountId = account.id; // undefined if error → stored as undefined in DB
```

The `createConnectedAccount` stores the `accountId` in the user record (line 63-65) — if Stripe returns an error, `undefined` is saved as the `stripeConnectAccountId`.

Similarly, `purchaseCoins` (line 111-128) credits coins even if Stripe returns an error (the mock path always credits).

---

### C-12: Webhook signature verification uses untyped catch
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 57-59
**Severity:** Critical
**Category:** TypeScript Safety / Error Handling

```typescript
} catch (err) {
  this.logger.warn('Invalid Stripe webhook signature', err.message);
```

The `err` variable is implicitly `any` (TypeScript strict mode would flag this). Accessing `err.message` will crash if `err` is not an Error object. This is in a financial webhook handler — an unhandled crash here could cause Stripe to retry the webhook, leading to duplicate processing.

---

### C-13: Stripe Connect purchaseCoins credits coins before payment completes
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 130-134
**Severity:** Critical
**Category:** Security / Financial

Even when Stripe API is available, coins are credited immediately after creating a PaymentIntent, not after the payment succeeds:

```typescript
// Credit coins (in production, do this in the webhook after payment succeeds)
await this.prisma.user.update({
  where: { id: userId },
  data: { coinBalance: { increment: pkg.coins } },
});
```

The comment acknowledges this should be done in the webhook, but it's not. Users get coins immediately, and if the payment fails/is disputed, the coins are never clawed back.

---

### C-14: Message field abused to store Stripe payment metadata
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 155
**Severity:** Critical
**Category:** Data Integrity / Schema Abuse

The Tip model's `message` field (which is a user-facing tip message, `@db.VarChar(500)`) is being used to store JSON with Stripe payment intent IDs:

```typescript
message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'pending' }),
```

This overwrites any actual user message. The Tip model has no dedicated field for storing the Stripe payment intent reference. When the webhook updates the tip (line 365), it overwrites the message again with completion data.

---

### C-15: No payment validation for orders
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 96-123
**Severity:** Critical
**Category:** Security / Financial Fraud

The `createOrder()` method creates orders and decrements stock atomically, but there is no payment step. Orders are created with `status: 'pending'` but there is no endpoint or mechanism to actually pay for them. Stock is decremented immediately on order creation, meaning users can reserve all stock without paying.

```typescript
// Stock decremented immediately — no payment needed
const updated = await tx.product.updateMany({
  where: { id: dto.productId, stock: { gte: qty }, status: 'active' },
  data: { stock: { decrement: qty }, salesCount: { increment: qty } },
});
```

---

### C-16: Zakat donations have no payment integration
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 255-281
**Severity:** Critical
**Category:** Security / Financial Fraud

The `donateZakat()` method creates donation records and increments fund amounts without any actual financial transaction. The `ZakatDonation` model has a `stripePaymentId` field that is never populated.

```typescript
this.prisma.zakatDonation.create({
  data: { fundId, donorId: userId, amount: dto.amount, isAnonymous: dto.isAnonymous || false },
  // stripePaymentId never set
}),
```

**Impact:** Anyone can claim to have donated any amount to any zakat fund. Fund raised amounts are fictional.

---

## MODERATE FINDINGS (31)

### M-01: Cashout returns stale balance after conditional update
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 226-248
**Severity:** Moderate
**Category:** Data Integrity

The `cashout()` method uses `updateMany` with `gte` check (good), but then returns `balance.diamonds - diamonds` using the pre-update balance value. Under concurrency, this may be incorrect.

```typescript
return {
  diamondsDeducted: diamonds,
  usdAmount,
  remainingDiamonds: balance.diamonds - diamonds, // Stale: uses pre-update value
};
```

---

### M-02: Tip amount uses JS number for Decimal(12,2) field
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, line 36-37
**Severity:** Moderate
**Category:** Data Integrity / Precision

The `amount` parameter is a JavaScript `number` (IEEE 754 float), but the Prisma Tip model stores it as `Decimal(12,2)`. Floating-point arithmetic errors can cause incorrect fee calculations:

```typescript
const platformFee = amount * 0.10; // JS float multiplication
const netAmount = amount - platformFee; // JS float subtraction
```

For `amount = 0.3`, `platformFee` could be `0.030000000000000002`. Prisma will round on storage, but the in-memory `netAmount` may be wrong.

---

### M-03: TipStats returns gross amount instead of net
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 123-163
**Severity:** Moderate
**Category:** Logic Error

`getTipStats()` aggregates `_sum: { amount: true }` and reports it as `totalEarned`. But `amount` is the gross tip amount, not the net (after 10% platform fee). Creators see inflated earnings.

```typescript
totalEarned: Number(totalEarned._sum.amount || 0), // Gross, not net
```

---

### M-04: Products pagination uses id-based cursor with createdAt ordering
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 26-42
**Severity:** Moderate
**Category:** Logic Error / Pagination

Products are ordered by `createdAt: 'desc'` but cursor pagination uses `id: { lt: cursor }`. Since product IDs are UUIDs (not cuid), they are NOT ordered by creation time. This means the cursor will skip or duplicate items.

```typescript
if (cursor) where.id = { lt: cursor };
// ...
orderBy: { createdAt: 'desc' },
```

The same bug exists for `getBusinesses()` (line 185, ordered by `rating: 'desc'`), `getZakatFunds()` (line 238, ordered by `createdAt: 'desc'`), and `getMyOrders()` (line 125).

---

### M-05: Businesses pagination ordered by rating but cursored by id
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 185-200
**Severity:** Moderate
**Category:** Logic Error / Pagination

Same cursor bug as M-04, but worse: businesses are ordered by `rating: 'desc'` which has no correlation with UUID ordering at all. Pagination is completely broken.

---

### M-06: Business owner can review their own business
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 202-226
**Severity:** Moderate
**Category:** Logic Error / Abuse

The `reviewBusiness()` method has no check to prevent the business owner from reviewing their own business. A restaurant owner can give themselves a 5-star rating.

```typescript
async reviewBusiness(userId: string, businessId: string, rating: number, comment?: string) {
  // No check: if (business.ownerId === userId) throw ...
```

---

### M-07: Product seller can review their own product
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 53-78
**Severity:** Moderate
**Category:** Logic Error / Abuse

Same issue as M-06 for products. No check prevents a seller from reviewing their own product.

---

### M-08: Zakat fund creator can donate to their own fund
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 255-281
**Severity:** Moderate
**Category:** Logic Error / Abuse

No check prevents a zakat fund recipient from donating to their own fund, inflating the `raisedAmount`.

---

### M-09: Community treasury contribution not checked for circle membership
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 293-310
**Severity:** Moderate
**Category:** Authorization

The `contributeTreasury()` method doesn't check if the user is a member of the circle that owns the treasury. Any authenticated user can contribute to any treasury.

---

### M-10: Treasury contribution and raised amount update are not atomic
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 300-307
**Severity:** Moderate
**Category:** Data Integrity

The contribution creation and the `raisedAmount` increment are two separate queries, not wrapped in a transaction. If the increment fails, the contribution exists but the fund total is wrong.

```typescript
await this.prisma.treasuryContribution.create({ ... });
// Separate query — not atomic
await this.prisma.communityTreasury.update({
  where: { id: treasuryId },
  data: { raisedAmount: { increment: amount } },
});
```

---

### M-11: No seller view of orders
**File:** `apps/api/src/modules/commerce/commerce.service.ts` and `commerce.controller.ts`
**Severity:** Moderate
**Category:** Missing Feature

There is `getMyOrders()` for buyers but no `getSellerOrders()` for sellers. Sellers can update order status but have no way to see their orders list.

---

### M-12: No product update or delete endpoints
**File:** `apps/api/src/modules/commerce/commerce.service.ts` and `commerce.controller.ts`
**Severity:** Moderate
**Category:** Missing Feature

Sellers can create products but cannot update titles, descriptions, prices, images, or mark products as draft/removed. No `updateProduct()` or `deleteProduct()` exists.

---

### M-13: No business update or delete endpoints
**File:** `apps/api/src/modules/commerce/commerce.service.ts` and `commerce.controller.ts`
**Severity:** Moderate
**Category:** Missing Feature

Business owners cannot update business information (hours, address, etc.) or remove their listing.

---

### M-14: Waqf has no donation/contribution endpoint
**File:** `apps/api/src/modules/community/community.service.ts`, lines 264-283
**Severity:** Moderate
**Category:** Missing Feature

The waqf module can create and list waqf funds, but there is no endpoint to contribute/donate to a waqf fund. The `WaqfFund` model has a `raisedAmount` field that can never be incremented.

---

### M-15: No subscription expiry/renewal handling
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 264-296
**Severity:** Moderate
**Category:** Missing Feature

Membership subscriptions have no `endDate` and no automatic renewal or expiry logic. Once subscribed, the subscription is active forever (or until manually cancelled). The `PremiumSubscription` has an `endDate` but nothing checks if it has passed.

---

### M-16: MembershipTier price stored as Decimal but handled as JS number
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 166-186
**Severity:** Moderate
**Category:** Data Integrity / Precision

The `price` parameter is a JS `number`, and the Prisma `MembershipTier.price` is `Decimal(12,2)`. Price comparisons and calculations in JS (`price <= 0 || price > 10000`) work but can have float precision issues for edge cases.

---

### M-17: Duplicate payment systems for the same features
**File:** `apps/api/src/modules/monetization/monetization.service.ts` vs `apps/api/src/modules/payments/payments.service.ts`
**Severity:** Moderate
**Category:** Architecture / Confusion

Two independent systems handle the same features:
- `monetization.service.ts` has `sendTip()`, `subscribe()`, `unsubscribe()` — all without payment
- `payments.service.ts` has `createPaymentIntent()` (for tips), `createSubscription()`, `cancelSubscription()` — all with Stripe

Both write to the same DB models (`Tip`, `MembershipSubscription`) but through different code paths with different validation.

---

### M-18: Gifts limit parameter not validated or capped
**File:** `apps/api/src/modules/gifts/gifts.controller.ts`, line 88
**Severity:** Moderate
**Category:** Performance / Abuse

The `limit` query parameter for gift history is parsed with `parseInt` but never validated. Passing `limit=999999` would attempt to fetch nearly all records.

```typescript
return this.giftsService.getHistory(userId, cursor, limit ? parseInt(limit, 10) : 20);
```

The service method accepts `limit = 20` default but has no cap. Same issue for `getProducts`, `getBusinesses`, `getZakatFunds`, `getMyOrders` in commerce (default 20 but no max check).

---

### M-19: Unused import RawBodyRequest in payments controller
**File:** `apps/api/src/modules/payments/payments.controller.ts`, line 12
**Severity:** Moderate
**Category:** Code Quality

`RawBodyRequest` is imported from `@nestjs/common` but never used in this file. It's also separately redeclared as an interface in `stripe-webhook.controller.ts` (line 18), shadowing the NestJS type.

---

### M-20: Diamond conversion rates inconsistent between services
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, line 40 vs `apps/api/src/modules/monetization/stripe-connect.service.ts`, line 197
**Severity:** Moderate
**Category:** Logic Error / Financial

Two different diamond-to-USD conversion rates exist:
- `gifts.service.ts` line 40: `100 diamonds = $0.70` (1 diamond = $0.007)
- `stripe-connect.service.ts` line 197: `1 diamond = $0.01 USD` (100 diamonds = $1.00)

The cashout value differs by 43% depending on which code path is used.

---

### M-21: DIAMONDS_PER_USD_CENT calculation is confusing and possibly wrong
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, line 40
**Severity:** Moderate
**Category:** Logic Error

```typescript
const DIAMONDS_PER_USD_CENT = 100 / 70; // ≈ 1.4286
```

This is meant to represent "100 diamonds = 70 cents" but the constant name and usage are confusing. In `cashout()` line 222:
```typescript
const usdCents = Math.floor(diamonds / DIAMONDS_PER_USD_CENT);
```

For 100 diamonds: `Math.floor(100 / 1.4286) = Math.floor(70) = 70` cents = $0.70. This is correct but the variable naming suggests "diamonds per cent" when it's actually "diamonds per cent."

---

### M-22: Stripe Connect sends coins to wrong balance system
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 131-134
**Severity:** Moderate
**Category:** Data Integrity

The `purchaseCoins` method in `stripe-connect.service.ts` credits coins to `User.coinBalance`, while the `purchaseCoins` in `gifts.service.ts` credits to `CoinBalance.coins`. These are different database columns in different tables.

---

### M-23: Gift sendGift in stripe-connect.service also uses wrong balance
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 151-172
**Severity:** Moderate
**Category:** Data Integrity

`sendGift` checks `User.coinBalance` and decrements `User.coinBalance`, while `gifts.service.ts sendGift` checks and decrements `CoinBalance.coins`.

---

### M-24: No rate limiting on gift catalog or balance endpoints
**File:** `apps/api/src/modules/gifts/gifts.controller.ts`, lines 73-78 and 39-44
**Severity:** Moderate
**Category:** Security

The `getCatalog()` and `getBalance()` endpoints have no specific throttle. While the global throttle applies, financial endpoints should have tighter limits.

---

### M-25: Order status update doesn't restore salesCount on cancellation
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 162-168
**Severity:** Moderate
**Category:** Data Integrity

When an order is cancelled or refunded, `stock` is restored (incremented) but `salesCount` is not decremented. Over time, `salesCount` becomes inflated.

---

### M-26: Zakat fund goal check is racy
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 274-278
**Severity:** Moderate
**Category:** Data Integrity / Race Condition

After the transaction, a separate query checks if the goal is reached. Under concurrent donations, the fund could be marked completed multiple times, or the check could read stale data.

```typescript
// Separate query AFTER the transaction — stale data possible
const updated = await this.prisma.zakatFund.findUnique({ where: { id: fundId } });
if (updated && Number(updated.raisedAmount) >= Number(updated.goalAmount)) {
  await this.prisma.zakatFund.update({ ... status: 'completed' });
}
```

---

### M-27: Stripe API version may not exist
**File:** `apps/api/src/modules/payments/payments.service.ts`, line 28
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 32
**Severity:** Moderate
**Category:** Configuration

Both files use API version `'2026-02-25.clover'` which may not be a valid Stripe API version. Stripe versions follow the pattern `YYYY-MM-DD` without suffixes. An invalid version would cause all Stripe calls to fail.

---

### M-28: Payment methods list swallows errors
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 322-343
**Severity:** Moderate
**Category:** Error Handling

`listPaymentMethods()` catches all errors and returns an empty array. A Stripe configuration error, authentication failure, or network issue looks the same to the client as "user has no payment methods."

---

### M-29: No webhook event deduplication
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 64-87
**Severity:** Moderate
**Category:** Data Integrity

Stripe may retry webhook events. There is no idempotency check (e.g., checking if a `payment_intent.succeeded` has already been processed). Processing the same event twice could update tip status redundantly (benign) or extend subscription periods incorrectly.

---

### M-30: Products getProducts pagination cursor after pop is wrong
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 39-41
**Severity:** Moderate
**Category:** Logic Error

After `products.pop()` removes the extra item, the cursor is read from the last item of the mutated array. But the `id: { lt: cursor }` pattern means the next page starts with items whose ID is less than the cursor. With UUID IDs and `createdAt` ordering, this doesn't produce correct pagination.

---

### M-31: attachPaymentMethod has no error handling
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 345-349
**Severity:** Moderate
**Category:** Error Handling

`attachPaymentMethod()` calls `this.stripe.paymentMethods.attach()` without try/catch. A Stripe error will bubble up as an unhandled 500 error with Stripe's error message exposed to the client.

---

## MINOR FINDINGS (28)

### m-01: Gift catalog is hardcoded — no admin management
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 28-37
**Severity:** Minor
**Category:** Flexibility

The gift catalog is a hardcoded array. There's no way to add, remove, or modify gifts without a code deployment.

---

### m-02: CoinTransaction type field unvalidated
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 74-81, 145-162
**Severity:** Minor
**Category:** Data Integrity

Transaction types ('purchase', 'gift_sent', 'gift_received', 'cashout') are plain strings, not validated against an enum.

---

### m-03: Missing currency field on coin transactions
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 74-81
**Severity:** Minor
**Category:** Data Integrity

Coin transactions don't record currency. The `CoinTransaction` model has no currency field, making multi-currency support impossible.

---

### m-04: parseInt without radix on some calls
**File:** `apps/api/src/modules/commerce/commerce.controller.ts`, line 39
**Severity:** Minor
**Category:** Code Quality

```typescript
limit ? parseInt(limit) : undefined
```

Missing radix parameter (should be `parseInt(limit, 10)`). While the default radix is 10 in modern JS, ESLint recommends always specifying it.

---

### m-05: Product images array has no URL validation
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`, line 13
**Severity:** Minor
**Category:** Security / Input Validation

Product images are validated as `@IsString({ each: true })` but not as valid URLs. Malicious strings (JS URIs, data URIs, extremely long strings) could be stored.

---

### m-06: CreateProductDto missing shippingInfo and halalCertUrl validation
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`, line 9-20
**Severity:** Minor
**Category:** Input Validation

The service accepts `shippingInfo` and `halalCertUrl` fields but the DTO doesn't declare them, so they'd be stripped by `whitelist: true` in the validation pipe.

---

### m-07: CreateBusinessDto missing avatarUrl, coverUrl, halalCertUrl, isMuslimOwned
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`, lines 40-49
**Severity:** Minor
**Category:** Input Validation

The service accepts these fields but the DTO only has name, description, category, address, lat, lng, phone, website. The remaining fields would be stripped.

---

### m-08: No @IsUrl on business website field
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`, line 48
**Severity:** Minor
**Category:** Input Validation

The `website` field is `@IsString()` but not `@IsUrl()`. Arbitrary strings could be stored as website URLs.

---

### m-09: No @IsPhoneNumber on business phone field
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`, line 47
**Severity:** Minor
**Category:** Input Validation

The `phone` field is `@IsString()` with no validation. Could store any string.

---

### m-10: MembershipTier level field unvalidated
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, line 181
**Severity:** Minor
**Category:** Data Integrity

The `level` field defaults to 'bronze' but accepts any string. No validation against valid levels (bronze/silver/gold/platinum or similar).

---

### m-11: Membership subscription has no endDate set on creation
**File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 284-293
**Severity:** Minor
**Category:** Logic

The subscription is created with `startDate: new Date()` but no `endDate`. It's active indefinitely.

---

### m-12: Test file doesn't actually test the service methods
**File:** `apps/api/src/modules/monetization/stripe-connect.service.spec.ts`
**Severity:** Minor
**Category:** Test Quality

The test file creates the service but never calls its actual methods. Instead, it tests math operations and mock Prisma calls directly. No actual `service.purchaseCoins()`, `service.sendGift()`, or `service.cashout()` is called.

---

### m-13: CashoutResult type not used in gifts controller response
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, line 22-27
**Severity:** Minor
**Category:** Code Quality

The `CashoutResult` interface is exported but the controller doesn't declare the return type, so Swagger documentation won't show the response shape.

---

### m-14: GiftCatalogItem exported but not used externally
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, line 8
**Severity:** Minor
**Category:** Code Quality

The `GiftCatalogItem` interface is exported but never imported by any other module.

---

### m-15: Product price comparison uses Number() on Decimal
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, line 113
**Severity:** Minor
**Category:** Precision

`Number(product.price)` converts a Prisma Decimal to a JS number. For very large prices (near 10 digits), precision loss is possible.

---

### m-16: No limit cap on commerce list endpoints
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, multiple
**Severity:** Minor
**Category:** Performance

All list methods accept a `limit` parameter with default 20 but no maximum. Passing a large limit could retrieve excessive data.

---

### m-17: Zakat fund status transitions not validated
**File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 238-281
**Severity:** Minor
**Category:** Logic

A 'completed' fund can receive more donations if the status was set to 'completed' by the goal-reached check but then another concurrent donation arrives before the status update propagates.

---

### m-18: No index on ZakatFund.status
**File:** `apps/api/prisma/schema.prisma`, lines 3190-3209
**Severity:** Minor
**Category:** Performance

`getZakatFunds()` filters by `status: 'active'` but there's no index on the `status` field. As the table grows, this query will slow down.

---

### m-19: No index on CommunityTreasury.status
**File:** `apps/api/prisma/schema.prisma`, lines 3228-3247
**Severity:** Minor
**Category:** Performance

Same issue — `contributeTreasury()` filters by `status: 'active'` without an index.

---

### m-20: No index on Product.status alone
**File:** `apps/api/prisma/schema.prisma`, lines 3067-3097
**Severity:** Minor
**Category:** Performance

There's a composite index `@@index([category, status])` but no standalone index on `status`. Queries that filter by `status: 'active'` without category won't use it efficiently.

---

### m-21: StripeWebhookController has @Injectable() decorator
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 26
**Severity:** Minor
**Category:** Code Quality

Controllers should not have `@Injectable()` — they're already injectable by virtue of being registered in a module as controllers.

---

### m-22: Stripe key read from process.env directly in webhook controller
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 31, 48
**Severity:** Minor
**Category:** Code Quality / Consistency

The webhook controller reads `process.env.STRIPE_SECRET_KEY` and `process.env.STRIPE_WEBHOOK_SECRET` directly instead of using `ConfigService`, unlike the `PaymentsService` which uses `ConfigService`.

---

### m-23: No currency validation on payment intents
**File:** `apps/api/src/modules/payments/payments.service.ts`, line 107
**Severity:** Minor
**Category:** Input Validation

The `currency` parameter is passed to Stripe without validation. Invalid currencies (e.g., "XXX") would cause a Stripe error that's caught but returns a generic "Payment processing failed" message.

---

### m-24: Redis customer mapping has no database backup
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 37-69
**Severity:** Minor
**Category:** Data Integrity

The Stripe customer ID mapping is stored only in Redis with a 30-day TTL. If Redis is flushed or the key expires, a new Stripe customer is created for the same user, leading to duplicate Stripe customers.

---

### m-25: No idempotency on tip creation
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 148-159
**Severity:** Minor
**Category:** Data Integrity

If `createPaymentIntent` is called twice for the same tip, two payment intents and two pending tips are created. No idempotency key prevents duplicates.

---

### m-26: Subscription mapping stored only in Redis
**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 82-84
**Severity:** Minor
**Category:** Data Integrity

The Stripe subscription <-> internal subscription mapping is only in Redis with a 30-day TTL. After 30 days, webhook events for that subscription won't find the mapping, and renewal payments won't extend the subscription.

---

### m-27: Diamond rate constant differs from Creator receives
**File:** `apps/api/src/modules/gifts/gifts.service.ts`, line 44
**Severity:** Minor
**Category:** Documentation

The constant `DIAMOND_RATE = 0.7` represents "Creator receives 70% of coin cost as diamonds." Meanwhile, `stripe-connect.service.ts` line 18 says `PLATFORM_FEE_PERCENT = 30` (30% platform, 70% creator). These should be derived from a single source of truth.

---

### m-28: WaqfFund model has no donations relation
**File:** `apps/api/prisma/schema.prisma`, lines 3463-3476
**Severity:** Minor
**Category:** Missing Feature / Schema

Unlike `ZakatFund` which has a `donations ZakatDonation[]` relation, `WaqfFund` has no contribution relation or model. There's no way to track who contributed to a waqf fund.

---

## SUMMARY

### Most Critical Issues (must fix before launch)
1. **Free money exploit** — `purchaseCoins` gives unlimited coins without payment (C-01, C-10)
2. **Dual balance system** — coins/diamonds tracked in two different places (C-02)
3. **All financial operations have no real payment** — tips, subscriptions, orders, donations, and premium all create records without any Stripe charge (C-04, C-05, C-06, C-15, C-16)
4. **StripeConnectService is dead code** — not registered in any module (C-03)
5. **Race condition on gift sending** — balance check outside transaction (C-08)
6. **9 DTOs have zero validation** — any payload accepted for financial endpoints (C-09)
7. **Cashout deducts before transfer, no rollback** — diamonds lost on Stripe failure (C-07)

### Architecture Problems
- Two parallel payment systems (monetization vs payments module) handling the same features
- Two parallel balance systems (User.coinBalance vs CoinBalance.coins)
- Two inconsistent diamond-to-USD conversion rates ($0.007 vs $0.01)
- StripeConnectService exists but is completely orphaned

### Recommended Fix Priority
1. Remove or wire up the dual balance system — pick one and migrate
2. Add payment verification to all financial operations (tips, subscriptions, orders, donations, premium)
3. Register `StripeConnectService` in the module or delete it
4. Add class-validator decorators to all inline DTOs
5. Fix the `sendGift` race condition with a conditional `updateMany` pattern
6. Add error handling to all `fetch()` calls in stripe-connect.service.ts
7. Unify conversion rates and fee constants
