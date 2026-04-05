# A21: Payments & Stripe Audit

**Auditor:** Hostile code review (automated)
**Date:** 2026-04-05
**Files reviewed:**
- `apps/api/src/modules/payments/payments.controller.ts` (120 lines)
- `apps/api/src/modules/payments/payments.service.ts` (1141 lines)
- `apps/api/src/modules/payments/stripe-webhook.controller.ts` (176 lines)
- `apps/api/src/common/constants/financial.ts` (30 lines)
- Prisma schema: `Tip`, `CoinBalance`, `CoinTransaction`, `PaymentMapping`, `ProcessedWebhookEvent`, `MembershipSubscription`, `MembershipTier`, `PremiumSubscription`, `Order`

**Total findings: 19** (3 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW)

---

## Findings

### [CRITICAL-01] Tip amount controlled by client with no server-side price enforcement

**File:** `payments.service.ts` lines 193-267
**Line:** 226-228

The `createPaymentIntent` method accepts `amount` and `currency` directly from the client DTO and passes them straight to Stripe:

```typescript
paymentIntent = await this.stripe.paymentIntents.create({
  amount: Math.round(amount * 100), // convert to cents
  currency: currency.toLowerCase(),
```

The DTO validation (`@Min(0.50) @Max(10000)`) only constrains the range. There is no server-side price lookup or verification against any pricing table. While tips are inherently user-chosen amounts (the sender decides how much to give), the real issue is:

1. The `platformFee` is computed from the client-supplied `amount` (line 253): `platformFee: amount * PLATFORM_FEE_RATE`. If a user sends $0.50, the platform earns $0.05. The Stripe minimum charge of $0.50 (50 cents) is enforced by the DTO but NOT after currency conversion. A GBP/EUR user paying `0.50 GBP` pays ~$0.63 but the fee is computed on `0.50`, not the USD equivalent. The platform fee is denominated in the raw `amount` regardless of currency.

2. The tip `amount` stored in the DB (line 248) is in whatever currency the user chose, but `platformFee` is always `amount * 0.10` regardless of currency. A $10 tip and a 10 MYR tip (worth ~$2.20) produce the same platformFee of 1.0, making reconciliation incoherent across currencies.

**Impact:** Platform fee accounting is incorrect for non-USD currencies. Financial reconciliation will show wrong numbers.

---

### [CRITICAL-02] No refund handling whatsoever

**File:** All three files
**Evidence:** Grep for `refund|REFUND|charge.refund` across all payment files returns zero matches.

Stripe sends `charge.refunded` events when a refund is processed (manual from dashboard or via API). The webhook handler (lines 95-137 of `stripe-webhook.controller.ts`) has no case for:
- `charge.refunded`
- `charge.refund.created`
- `charge.refund.updated`
- `payment_intent.canceled`

When a CS agent issues a refund from the Stripe dashboard:
1. The user keeps their coins/diamonds/premium time.
2. The tip stays in `completed` status.
3. The order stays in `PAID` status.
4. No diamond reversal occurs.
5. No coin deduction occurs.
6. No audit trail is created.

This is free money. Refund a tip, keep the diamonds. Refund a coin purchase, keep the coins.

**Impact:** Complete inability to process refunds without manual database surgery. Every refund is a financial leak.

---

### [CRITICAL-03] `paused` status in subscription update handler does not exist in MemberSubStatus enum

**File:** `payments.service.ts` lines 1032-1050

```typescript
const statusMap: Record<string, string> = {
  active: 'active',
  past_due: 'past_due',
  canceled: 'cancelled',
  unpaid: 'past_due',
  paused: 'paused', // <-- THIS DOES NOT EXIST IN THE ENUM
};
const mappedStatus = statusMap[subscription.status] ?? 'active';
```

The `MemberSubStatus` Prisma enum has: `active`, `cancelled`, `expired`, `pending`, `past_due`, `cancel_pending`. There is no `paused` value.

When Stripe sends a `customer.subscription.updated` event with `status: 'paused'`, the handler will attempt:
```typescript
data: { status: 'paused' as MemberSubStatus }
```

This will throw a Prisma validation error at runtime because `'paused'` is not a valid enum value. The error propagates up to the webhook controller's catch block (line 138), which for this type of error (Prisma validation) is NOT a `BadRequestException`/`NotFoundException`/`ForbiddenException`, so it's classified as non-deterministic (line 143-147). This means:
1. The Redis claim key is deleted (line 157).
2. The error is re-thrown, returning 500 to Stripe.
3. Stripe retries for 3 days.
4. Every retry fails identically.

**Impact:** Paused subscriptions cause an infinite retry loop that wastes Stripe webhook quota and generates noise in error logs for 3 days per event.

---

### [HIGH-01] Tip lookup metadata fallback is vulnerable to ambiguous matching

**File:** `payments.service.ts` lines 758-776

Layer 3 of the tip lookup in `handleTipPaymentSucceeded`:

```typescript
const tip = await this.prisma.tip.findFirst({
  where: {
    senderId,
    receiverId,
    amount: metaAmount,
    status: 'pending',
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true },
});
```

If user A sends user B two $5.00 tips in quick succession, both create separate payment intents. If Redis and PaymentMapping both fail for the second intent, the metadata fallback finds the most recent pending tip from A to B for $5.00 — which might be the FIRST tip (if the first webhook arrived but Redis mapping was lost before the second payment).

Result: the second payment intent completes the first tip, leaving the second tip permanently `pending` with real money charged. The customer is charged twice but only one tip is credited.

**Impact:** Double-charge with single-credit in the edge case where Redis + DB mapping both fail for repeated same-amount tips between the same pair.

---

### [HIGH-02] Coin purchase amount calculated with floating-point arithmetic

**File:** `payments.service.ts` lines 165-169

```typescript
const priceInCents = Math.ceil(coinAmount * 0.99);
```

Floating-point multiplication of integers by 0.99 produces precision errors:
- `coinAmount = 101`: `101 * 0.99 = 99.99` -> `Math.ceil(99.99) = 100` (correct)
- `coinAmount = 10`: `10 * 0.99 = 9.9` -> `Math.ceil(9.9) = 10` (correct)
- `coinAmount = 100`: `100 * 0.99 = 99` -> `Math.ceil(99) = 99` (correct)

While `Math.ceil` mitigates the worst case (undercharging), it introduces penny-level overcharging for some amounts. For example:
- `coinAmount = 1`: `1 * 0.99 = 0.99` -> `Math.ceil(0.99) = 1` cent. But minimum is 50 cents, so this path throws. However, `coinAmount = 51`: `51 * 0.99 = 50.49` -> `Math.ceil(50.49) = 51` cents, but `50.49` exactly represented? `51 * 0.99` in IEEE 754: `50.49` is exact here, but for larger numbers like `coinAmount = 33333`: `33333 * 0.99 = 32999.67` -> okay. The real risk is that `COIN_PRICE_RATE` (0.99) is defined in `financial.ts` but this file hardcodes `0.99` instead of importing the constant.

**Impact:** Hardcoded magic number `0.99` duplicates `COIN_PRICE_RATE` from `financial.ts`. If the rate changes in the constant file, the actual pricing won't update. Two sources of truth for the same business-critical value.

---

### [HIGH-03] No webhook event type allowlist — unknown events silently accepted

**File:** `stripe-webhook.controller.ts` lines 95-137

The `default` case in the switch statement:
```typescript
default:
  this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
```

This logs a warning but returns 200 with `{ received: true }`. The event is also persisted to `ProcessedWebhookEvent` at line 164. This means:

1. If Stripe adds a new webhook event type that carries important data (e.g., `issuing.transaction.created`, `tax.calculation.completed`), it's silently discarded.
2. If an attacker somehow bypasses signature verification, ANY event type is "handled" (accepted and cached).
3. More importantly: the Redis idempotency key and DB record are created for unhandled events. If the system later adds a handler for that event type, replaying the event won't work because it's already marked as processed.

**Impact:** Future event types are permanently marked as processed before handlers exist. Adding new webhook handlers requires clearing stale idempotency records.

---

### [HIGH-04] Webhook secret empty string check is insufficient

**File:** `stripe-webhook.controller.ts` lines 47, 62-65

```typescript
this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
// ...
if (!this.webhookSecret) {
  this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
  throw new BadRequestException('Webhook secret not configured');
}
```

The empty-string check works, but the error is a `BadRequestException` (400) returned to Stripe. Stripe will interpret this as a client error and retry the webhook. The secret won't magically appear between retries. This creates 3 days of retries for a configuration error that needs operator intervention, not retries.

More critically: if `STRIPE_WEBHOOK_SECRET` is set to a wrong/stale value, `constructEvent` will throw and the error is caught at line 70-73. The `BadRequestException('Invalid webhook signature')` tells the attacker that signature verification is active but failed. This is information leakage — though minor since Stripe is the expected caller.

**Impact:** Misconfigured webhook secret causes 3-day retry storm from Stripe. Should return 200 to stop retries and alert operators instead.

---

### [HIGH-05] Payment method attachment has no ownership validation

**File:** `payments.controller.ts` line 109-119, `payments.service.ts` lines 473-484

```typescript
async attachPaymentMethod(userId: string, paymentMethodId: string) {
  const customerId = await this.getOrCreateStripeCustomer(userId);
  await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
}
```

The `paymentMethodId` comes from the client. A malicious user could attempt to attach a payment method belonging to another Stripe customer (e.g., obtained from a data breach or social engineering). While Stripe itself will reject attaching a payment method already attached to a different customer, if the payment method is detached (floating), any customer can claim it.

This is partially mitigated by Stripe's own security (payment methods created via client-side SDK are scoped), but the server does zero validation that the payment method was created by this user's client session.

**Impact:** Theoretical payment method theft if an attacker obtains a detached payment method ID. Low exploitability due to Stripe's controls, but the server provides no defense-in-depth.

---

### [MEDIUM-01] Tip `message` field abused as JSON state storage

**File:** `payments.service.ts` lines 252, 966-973, 1093-1100

The Tip model's `message` field (schema: `@db.VarChar(500)`, intended for user-facing tip messages) is used to store JSON state:

```typescript
// Line 252 — creation
message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'pending' }),
// Line 966 — failure
message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'failed', failedAt: ... }),
// Line 1093 — dispute
message: JSON.stringify({ stripePaymentIntentId: paymentIntent.id, status: 'disputed', disputeReason: ... }),
```

Problems:
1. The user can never set an actual tip message because the field is overwritten with JSON.
2. The JSON string can exceed 500 chars if `failureMessage` from Stripe is long, causing a Prisma truncation or error.
3. The `stripePaymentId` field on Tip already stores the payment intent ID — the JSON `message` duplicates it.

**Impact:** Message field is corrupted for its intended purpose. Potential data truncation on long Stripe error messages.

---

### [MEDIUM-02] No transaction around tip creation + mapping storage

**File:** `payments.service.ts` lines 246-259

```typescript
const tip = await this.prisma.tip.create({ data: { ... } });
await this.storePaymentIntentMapping(paymentIntent.id, tip.id);
```

The tip record is created first, then the mapping is stored separately. If the server crashes between these two operations:
1. The tip exists in DB with status `pending`.
2. No PaymentMapping exists linking `paymentIntent.id` to `tip.id`.
3. When Stripe sends the `payment_intent.succeeded` webhook, the Layer 1 (Redis) and Layer 2 (PaymentMapping DB) lookups both fail.
4. Layer 3 (Tip.stripePaymentId) also fails because `stripePaymentId` is only set on completion.
5. Layer 4 (metadata fallback) would find it, but this is fragile (see HIGH-01).

The Stripe PaymentIntent was already created (line 226), so money will be charged. If all lookup layers fail, the tip stays `pending` forever and the receiver never gets diamonds.

**Impact:** Crash between tip creation and mapping storage can orphan a tip, requiring manual reconciliation.

---

### [MEDIUM-03] `handlePaymentIntentFailed` tip lookup is imprecise

**File:** `payments.service.ts` lines 943-978

When Redis mapping is lost for a failed payment intent:
```typescript
const tip = await this.prisma.tip.findFirst({
  where: { senderId, status: 'pending' },
  orderBy: { createdAt: 'desc' },
  select: { id: true },
});
```

This finds the most recent pending tip by the sender — regardless of receiver, amount, or currency. If a user has multiple pending tips (sent to different people), a failed payment for one tip will incorrectly mark a different tip as `failed`.

**Impact:** Wrong tip marked as failed when user has multiple pending tips and Redis mapping is lost.

---

### [MEDIUM-04] `handleInvoicePaid` fallback uses invoice metadata, but metadata is set on subscription, not invoice

**File:** `payments.service.ts` lines 866-890

```typescript
const userId = invoice.metadata?.userId || invoice.metadata?.mizanlyUserId;
const tierId = invoice.metadata?.tierId || invoice.metadata?.mizanlyTierId;
```

The subscription is created with `metadata: { tierId, userId, mizanlyUserId: userId }` (line 334). However, Stripe does NOT automatically copy subscription metadata to invoices. `invoice.metadata` would only contain data if metadata was explicitly set on the invoice. For auto-generated subscription invoices, `invoice.metadata` is typically empty.

The actual subscription ID is available via `invoice.subscription`, which IS used to query Redis. But the DB fallback path relies on invoice metadata that likely doesn't exist.

**Impact:** DB fallback for invoice.paid webhook is likely dead code. If Redis mapping expires and subscription metadata isn't on the invoice, the handler silently returns without updating the subscription.

---

### [MEDIUM-05] Stripe customer ID cached in Redis without DB persistence

**File:** `payments.service.ts` lines 51-84

`getOrCreateStripeCustomer` stores the customer ID in Redis with a 30-day TTL:
```typescript
await this.redis.setex(redisKey, 60 * 60 * 24 * 30, customer.id);
```

There is no DB persistence of the Stripe customer ID. If Redis is flushed or the key expires:
1. Next call creates a NEW Stripe customer for the same user.
2. Now the user has two Stripe customers. The old one has payment methods and subscriptions attached.
3. New payment intents go to the new customer, but existing subscriptions are on the old customer.
4. `listPaymentMethods` returns empty (new customer has no cards).

**Impact:** Redis flush or expiry creates duplicate Stripe customers, orphaning existing payment methods and subscriptions. Stripe customer ID should be persisted on the User model.

---

### [MEDIUM-06] `cancel_pending` status string cast bypasses enum validation

**File:** `payments.service.ts` line 428

```typescript
data: { status: 'cancel_pending' as MemberSubStatus },
```

While `cancel_pending` does exist in the `MemberSubStatus` enum (verified in schema), the `as MemberSubStatus` cast is a code smell. If the enum value were renamed or removed, TypeScript would not catch the error. The correct pattern is to use the Prisma-generated enum directly:

```typescript
import { MemberSubStatus } from '@prisma/client';
data: { status: MemberSubStatus.cancel_pending },  // would error if removed
```

This same pattern appears at line 1006 (`'past_due' as MemberSubStatus`), line 1047 (`mappedStatus as MemberSubStatus`).

**Impact:** Enum casts bypass compile-time safety. A schema migration removing `cancel_pending` would cause a runtime Prisma error, not a compile error.

---

### [MEDIUM-07] Coin purchase has no pending CoinTransaction created before webhook

**File:** `payments.service.ts` lines 156-191

`createCoinPurchaseIntent` creates a Stripe PaymentIntent but does NOT create a pending `CoinTransaction` in the database. When the webhook fires, `handleCoinPurchaseSucceeded` looks for a pending transaction:
```typescript
const updated = await tx.coinTransaction.updateMany({
  where: {
    userId,
    type: 'PURCHASE',
    amount: coinAmount,
    description: { contains: 'pending payment' },
  },
```

This will always find 0 rows (line 570) and fall through to creating a new completed transaction. The `updateMany` + fallback `create` pattern is dead code for coins — the "update pending" path never executes.

**Impact:** Dead code path. Not a bug per se, but the code structure implies a pending transaction should exist. Either create one in `createCoinPurchaseIntent` or remove the dead `updateMany` block.

---

### [LOW-01] Subscription creation does not verify user isn't already subscribed

**File:** `payments.service.ts` lines 269-389

```typescript
const existing = await this.prisma.membershipSubscription.findUnique({
  where: { tierId_userId: { tierId, userId } },
});
if (existing) {
  dbSubscription = await this.prisma.membershipSubscription.update({
    where: { id: existing.id },
    data: { status: 'pending', startDate: new Date(), endDate: null },
  });
}
```

If the user already has an `active` subscription, this resets it to `pending` with a null `endDate`. The previous subscription end date is lost. If the Stripe subscription creation fails later (after the DB update), the user's previously active subscription is now `pending` with no end date — effectively downgraded.

However, the Stripe subscription creation happens BEFORE the DB update (lines 326-345 happen before 348-371). So the DB only updates if Stripe succeeds. Still, there's no check for `if (existing.status === 'active') throw('Already subscribed')` — the user can create duplicate Stripe subscriptions for the same tier.

**Impact:** Users can create multiple Stripe subscriptions for the same tier, causing double billing. The DB unique constraint prevents duplicate records but allows status resets.

---

### [LOW-02] Diamond reversal on dispute silently fails if receiver already spent diamonds

**File:** `payments.service.ts` lines 1120-1125

```typescript
await tx.coinBalance.updateMany({
  where: { userId: tip.receiverId, diamonds: { gte: diamondsToDeduct } },
  data: { diamonds: { decrement: diamondsToDeduct } },
});
```

The `WHERE diamonds >= diamondsToDeduct` guard prevents negative balances, which is good. But if the receiver has already spent/cashed out their diamonds, the deduction silently does nothing (updateMany count = 0). No error is logged, no alert is raised, no partial deduction is attempted.

**Impact:** Dispute diamond reversal silently fails when receiver has insufficient balance. The platform absorbs the loss with no alert for manual intervention.

---

### [LOW-03] `getOrCreateStripeCustomer` has no email update mechanism

**File:** `payments.service.ts` lines 51-84

When a Stripe customer is created, the user's current email is used. If the user later changes their email in Clerk/the app, the Stripe customer record retains the old email. Stripe invoices and receipts will be sent to the old email address.

Since the customer ID is cached in Redis for 30 days, there's no mechanism to detect the email mismatch even on the next payment.

**Impact:** Stale email on Stripe customer. Users may not receive Stripe receipts after email change.

---

### [LOW-04] `CreatePaymentIntentDto` allows non-integer tip amounts producing floating-point cent calculation

**File:** `payments.controller.ts` line 20, `payments.service.ts` line 227

```typescript
@IsNumber() @Min(0.50) @Max(10000) amount: number;
// ...
amount: Math.round(amount * 100), // convert to cents
```

`@IsNumber()` allows any float. A user sending `amount: 1.999` produces `Math.round(1.999 * 100) = Math.round(199.9) = 200` cents ($2.00). But the tip DB record stores `amount: 1.999` (Decimal(12,2) truncates to `2.00`). The `platformFee` is `1.999 * 0.10 = 0.1999`, stored as `0.20` after Decimal truncation. So the user sees "$2.00 tip" but typed `1.999`. This is cosmetic but could cause minor reconciliation discrepancies if the app sends non-standard amounts.

**Impact:** Cosmetic. Floating-point amounts interact with Decimal(12,2) truncation in minor ways. Consider adding `@IsInt()` validation or rounding to 2 decimal places server-side.

---

## Checklist Verification

### 1. Double-spend -- Can a payment be applied twice? Idempotency enforced?

**PASS (mostly).** Multiple layers of idempotency:
- Redis SET NX with 48h TTL in webhook controller (line 78).
- DB `ProcessedWebhookEvent` dedup (line 85-91).
- `PaymentMapping` unique constraint + claim-first pattern in coin purchase (line 537-548) and premium (line 684-694).
- `updateMany WHERE status = 'pending'` conditional transitions for tips (line 789-795) and marketplace orders (line 629-635).

**GAP:** The Redis claim is acquired BEFORE the handler runs, but if the handler crashes (non-deterministic error), the claim is released (line 157). Between claim release and Stripe's retry, a second delivery could race. The DB `ProcessedWebhookEvent` check at line 85-91 runs AFTER the Redis check, so it would catch this. However, the DB record is only written on SUCCESS (line 164). If the first attempt failed and released the Redis claim, and the DB record wasn't written, the second attempt will re-process. This is correct behavior (retry failed events), not a double-spend.

**VERDICT: Idempotency is well-implemented. No double-spend vector found.**

### 2. Amount manipulation -- Can client specify their own price? Server validates amount?

**PARTIAL PASS.** Tips: the amount IS user-chosen (correct for tips), validated within $0.50-$10,000 range. Coins: server computes price from `coinAmount` (correct). Subscriptions: server reads `tier.price` from DB (correct). Marketplace orders: not created here (separate module).

**GAP:** Currency mismatch in tip platform fee calculation (see CRITICAL-01). Coin price uses hardcoded `0.99` instead of `COIN_PRICE_RATE` constant (see HIGH-02).

### 3. Webhook verification -- Is Stripe signature verified? Raw body used?

**PASS.** `constructEvent(rawBody, signature, this.webhookSecret)` at line 69. `rawBody: true` configured in NestJS bootstrap (main.ts line 129). Empty webhook secret is rejected before verification (line 62-65).

### 4. Race conditions -- Concurrent webhook deliveries handled?

**PASS.** Redis SET NX (line 78) is atomic. DB unique constraints on `PaymentMapping.stripeId` provide secondary serialization. `updateMany` with conditional WHERE clauses prevent check-then-act races on status transitions.

### 5. Refund handling -- Are refunds processed correctly? Coins/diamonds reversed?

**FAIL.** No refund handling exists at all. See CRITICAL-02.

### 6. Currency -- Is currency hardcoded or user-controlled? Can someone pay in wrong currency?

**PARTIAL PASS.** Coins: hardcoded USD (correct). Tips: user selects from allowlist `['usd', 'gbp', 'eur', 'aud', 'cad']` (reasonable). Subscriptions: uses `tier.currency` from DB (correct). But tip platform fee is computed in tip currency, not normalized to USD. See CRITICAL-01.

### 7. State machine -- PENDING->COMPLETED->REFUNDED enforced? Can go backwards?

**PARTIAL PASS.** Tip: `pending -> completed` enforced by `updateMany WHERE status = 'pending'`. `pending -> failed` also works. `completed -> disputed` enforced by `updateMany WHERE status != 'disputed'`.

**GAP:** No `completed -> refunded` transition exists (no refund handling). No `disputed -> completed` transition (if dispute is resolved in merchant's favor). The `TipStatus` enum has no `refunded` value. MemberSubStatus has no enforcement of valid transitions — the handler maps Stripe status directly without checking current DB status.

### 8. Error handling -- Stripe API failures handled gracefully? No money lost?

**PARTIAL PASS.** All Stripe API calls are wrapped in try/catch. PaymentIntent creation failure throws before DB record creation (no orphan). Subscription creation failure throws before DB record creation.

**GAP:** `handleInvoicePaid` fallback (lines 905-909) sets `endDate: new Date()` when Stripe retrieval fails. This is wrong — the subscription's end date should be extended by one period, not set to now. Setting to now means a renewal that should last until next month is only valid until the moment the webhook fired.

**GAP:** `handleCoinPurchaseSucceeded` returns silently with only a log when metadata is missing (line 528-529). Money was charged but coins are never credited. No alert mechanism beyond a log line.
