# Module: Monetization, Payments, Gifts & Commerce

> Extracted 2026-03-25 from source files. Line numbers reference actual source.

---

## 1. Module Overview

| Module | Controller | Service | Files | Source Lines | Test Lines |
|--------|-----------|---------|-------|-------------|------------|
| **Monetization** | `monetization.controller.ts` (253 lines) | `monetization.service.ts` (556 lines) | 5 | 809 | 1,153 |
| **Payments** | `payments.controller.ts` (99 lines) + `stripe-webhook.controller.ts` (129 lines) | `payments.service.ts` (617 lines) | 8 | 845 | 555 |
| **Gifts** | `gifts.controller.ts` (112 lines) | `gifts.service.ts` (345 lines) | 9 | 457 | 636 |
| **Commerce** | `commerce.controller.ts` (241 lines) | `commerce.service.ts` (629 lines) + `dto/commerce.dto.ts` (123 lines) | 7 | 993 | 548 |
| **TOTAL** | 4 controllers (incl. webhook) | 4 services | 29 | 3,104 | 2,892 |

### Module Dependencies

- **MonetizationModule**: standalone (PrismaService only)
- **PaymentsModule**: ConfigService, Redis (`@Inject('REDIS')`), Stripe SDK
- **GiftsModule**: standalone (PrismaService only)
- **CommerceModule**: imports `NotificationsModule` (for order notifications), ConfigService, Stripe SDK

---

## 2. Complete Endpoint Registry (54 endpoints)

### 2.1 Monetization Controller (16 endpoints)

**File:** `apps/api/src/modules/monetization/monetization.controller.ts`
**Route prefix:** `/api/v1/monetization`
**Default throttle:** 30 req/60s

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 1 | POST | `/monetization/tips` | ClerkAuthGuard | 10/60s | L57-69 | Send a tip to another user |
| 2 | GET | `/monetization/tips/sent` | ClerkAuthGuard | default | L71-81 | List tips sent by current user (cursor paginated) |
| 3 | GET | `/monetization/tips/received` | ClerkAuthGuard | default | L83-93 | List tips received by current user (cursor paginated) |
| 4 | GET | `/monetization/tips/stats` | ClerkAuthGuard | default | L95-102 | Get tip stats: totalEarned, totalGross, totalPlatformFees, totalSent, topSupporters[5] |
| 5 | POST | `/monetization/tiers` | ClerkAuthGuard | 10/60s | L105-116 | Create membership tier (name, price, benefits[], level) |
| 6 | GET | `/monetization/tiers/:userId` | OptionalClerkAuth | default | L118-124 | List user's active tiers (public, sorted by price ASC) |
| 7 | PATCH | `/monetization/tiers/:id` | ClerkAuthGuard | 10/60s | L126-139 | Update tier (owner only) |
| 8 | DELETE | `/monetization/tiers/:id` | ClerkAuthGuard | 10/60s | L141-153 | Delete tier (owner only, fails if active subscriptions) |
| 9 | PATCH | `/monetization/tiers/:id/toggle` | ClerkAuthGuard | 10/60s | L155-167 | Toggle tier active/inactive (owner only) |
| 10 | POST | `/monetization/subscribe/:tierId` | ClerkAuthGuard | 10/60s | L170-181 | Subscribe to a tier |
| 11 | DELETE | `/monetization/subscribe/:tierId` | ClerkAuthGuard | 10/60s | L183-194 | Unsubscribe from a tier |
| 12 | GET | `/monetization/subscribers` | ClerkAuthGuard | default | L196-206 | List subscribers to your tiers (cursor paginated) |
| 13 | GET | `/monetization/wallet/balance` | ClerkAuthGuard | default | L209-216 | Get wallet balance (diamonds + USD equivalent) |
| 14 | GET | `/monetization/wallet/payment-methods` | ClerkAuthGuard | default | L218-225 | List payment methods for cashout **[PLACEHOLDER]** |
| 15 | POST | `/monetization/wallet/cashout` | ClerkAuthGuard | 5/60s | L227-240 | Request diamond cashout to payment method |
| 16 | GET | `/monetization/wallet/payouts` | ClerkAuthGuard | default | L242-252 | Get payout history (cursor paginated) |

### 2.2 Payments Controller (6 endpoints)

**File:** `apps/api/src/modules/payments/payments.controller.ts`
**Route prefix:** `/api/v1/payments`
**Default throttle:** 60 req/60s
**All endpoints require ClerkAuthGuard** (applied at class level)

| # | Method | Route | Throttle | Line | Description |
|---|--------|-------|----------|------|-------------|
| 17 | POST | `/payments/create-payment-intent` | 10/60s | L43-53 | Create Stripe PaymentIntent for a tip |
| 18 | POST | `/payments/create-subscription` | 10/60s | L56-66 | Create Stripe Subscription for a membership tier |
| 19 | DELETE | `/payments/cancel-subscription` | 10/60s | L68-78 | Cancel Stripe Subscription |
| 20 | GET | `/payments/payment-methods` | default | L81-86 | List user's saved payment methods (via Stripe API) |
| 21 | POST | `/payments/attach-payment-method` | 10/60s | L88-98 | Attach payment method to Stripe customer |

### 2.3 Stripe Webhook Controller (1 endpoint, 8 event types)

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`
**Route prefix:** `/api/v1/payments/webhooks`
**Throttle:** SKIPPED (`@SkipThrottle()`)

| # | Method | Route | Line | Description |
|---|--------|-------|------|-------------|
| 22 | POST | `/payments/webhooks/stripe` | L44-127 | Stripe webhook handler (8 event types) |

### 2.4 Gifts Controller (7 endpoints)

**File:** `apps/api/src/modules/gifts/gifts.controller.ts`
**Route prefix:** `/api/v1/gifts`
**All endpoints require ClerkAuthGuard** (applied at class level)

| # | Method | Route | Throttle | Line | Description |
|---|--------|-------|----------|------|-------------|
| 23 | GET | `/gifts/balance` | default | L40-45 | Get coin and diamond balance |
| 24 | POST | `/gifts/purchase` | 10/60s | L47-58 | Purchase coins (creates PENDING transaction, NOT credited) |
| 25 | POST | `/gifts/send` | 30/60s | L60-72 | Send a gift to another user (atomic balance deduct) |
| 26 | GET | `/gifts/catalog` | default | L74-79 | Get available gift catalog (8 items) |
| 27 | GET | `/gifts/history` | default | L81-90 | Get coin transaction history (cursor paginated) |
| 28 | POST | `/gifts/cashout` | 5/60s | L92-103 | Cash out diamonds to USD |
| 29 | GET | `/gifts/received` | default | L105-110 | Get aggregated received gifts (grouped by type) |

### 2.5 Commerce Controller (25 endpoints)

**File:** `apps/api/src/modules/commerce/commerce.controller.ts`
**Route prefix:** `/api/v1/` (controller has no prefix -- routes are top-level)
**Default throttle:** 30 req/60s

#### Products (6 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 30 | POST | `/products` | ClerkAuthGuard | 10/60s | L26-31 | Create product listing |
| 31 | GET | `/products` | OptionalClerkAuth | 60/60s | L33-43 | Browse marketplace (cursor, category, search) |
| 32 | GET | `/products/:id` | OptionalClerkAuth | 60/60s | L45-51 | Get product detail (with reviews) |
| 33 | PATCH | `/products/:id` | ClerkAuthGuard | 10/60s | L53-59 | Update product (owner only) |
| 34 | DELETE | `/products/:id` | ClerkAuthGuard | 10/60s | L61-67 | Delete product (owner only, no active orders) |
| 35 | POST | `/products/:id/review` | ClerkAuthGuard | default | L69-74 | Review product (1-5 stars, one per user) |

#### Orders (4 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 36 | POST | `/orders` | ClerkAuthGuard | 10/60s | L78-84 | Create order (Stripe PaymentIntent + atomic stock decrement) |
| 37 | GET | `/orders/me` | ClerkAuthGuard | default | L86-91 | Get my orders (buyer) |
| 38 | GET | `/orders/selling` | ClerkAuthGuard | default | L93-102 | Get orders for my products (seller, optional status filter) |
| 39 | PATCH | `/orders/:id/status` | ClerkAuthGuard | default | L104-109 | Update order status (seller only, validated transitions) |

#### Halal Business Directory (5 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 40 | POST | `/businesses` | ClerkAuthGuard | 5/60s | L113-119 | Register halal business |
| 41 | GET | `/businesses` | OptionalClerkAuth | 60/60s | L121-133 | Browse halal businesses (category, lat/lng) |
| 42 | PATCH | `/businesses/:id` | ClerkAuthGuard | 10/60s | L135-141 | Update business (owner only) |
| 43 | DELETE | `/businesses/:id` | ClerkAuthGuard | 10/60s | L143-149 | Delete business (owner only) |
| 44 | POST | `/businesses/:id/review` | ClerkAuthGuard | default | L151-156 | Review business (1-5 stars, one per user) |

#### Zakat (3 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 45 | POST | `/zakat/funds` | ClerkAuthGuard | default | L160-165 | Create zakat fund |
| 46 | GET | `/zakat/funds` | OptionalClerkAuth | 60/60s | L167-173 | Browse zakat funds (cursor, category) |
| 47 | POST | `/zakat/funds/:id/donate` | ClerkAuthGuard | 5/60s | L175-181 | Donate to zakat fund |

#### Waqf Endowment (2 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 48 | GET | `/waqf/funds` | OptionalClerkAuth | 60/60s | L185-191 | Browse waqf funds |
| 49 | POST | `/waqf/funds/:id/contribute` | ClerkAuthGuard | 5/60s | L193-199 | Contribute to waqf fund |

#### Community Treasury (2 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 50 | POST | `/treasury` | ClerkAuthGuard | default | L203-208 | Create community treasury (circle member only) |
| 51 | POST | `/treasury/:id/contribute` | ClerkAuthGuard | 5/60s | L210-216 | Contribute to treasury (circle member only) |

#### Premium Subscription (3 endpoints)

| # | Method | Route | Guard | Throttle | Line | Description |
|---|--------|-------|-------|----------|------|-------------|
| 52 | GET | `/premium/status` | ClerkAuthGuard | default | L220-225 | Get premium subscription status |
| 53 | POST | `/premium/subscribe` | ClerkAuthGuard | default | L227-232 | Subscribe to premium (monthly/yearly) |
| 54 | DELETE | `/premium/cancel` | ClerkAuthGuard | default | L234-239 | Cancel premium subscription |

---

## 3. Constants — Single Source of Truth

### 3.1 Monetization Service Constants

**File:** `apps/api/src/modules/monetization/monetization.service.ts` (L26-38)

```typescript
const PLATFORM_FEE_RATE = 0.10;       // 10% platform fee on tips
const MIN_TIP_AMOUNT = 0.50;          // Minimum $0.50 (Stripe minimum)
const MAX_TIP_AMOUNT = 10000;         // Maximum $10,000
const DIAMOND_TO_USD = 0.007;         // 1 diamond = $0.007 (100 diamonds = $0.70)
const DIAMONDS_PER_USD_CENT = 100/70; // ~1.4286 diamonds per cent
const MIN_CASHOUT_DIAMONDS = 100;     // Minimum cashout: 100 diamonds ($0.70)
const VALID_TIER_LEVELS = ['bronze', 'silver', 'gold', 'platinum'];
```

### 3.2 Gifts Service Constants

**File:** `apps/api/src/modules/gifts/gifts.service.ts` (L45-48)

```typescript
const DIAMOND_TO_USD = 0.007;          // 1 diamond = $0.007 (DUPLICATED from monetization)
const DIAMONDS_PER_USD_CENT = 100/70;  // ~1.4286 diamonds per cent
const MIN_CASHOUT_DIAMONDS = 100;      // Minimum cashout: 100 diamonds
const DIAMOND_RATE = 0.7;             // Creator receives 70% of coin cost as diamonds
```

**IMPORTANT:** The `DIAMOND_TO_USD` and conversion constants are duplicated between `monetization.service.ts` and `gifts.service.ts`. Both files have a comment saying they must be kept in sync. There is no shared constants file.

---

## 4. Tip Flow (End-to-End)

### 4.1 Client-Side Tip Initiation

**Step 1: Create PaymentIntent**
- Client calls `POST /payments/create-payment-intent` with `{ amount, currency, receiverId }`
- `payments.service.ts` L114-182:
  1. Validates amount > 0 and senderId !== receiverId
  2. Verifies receiver exists in DB
  3. Gets or creates Stripe customer for sender (cached in Redis 30 days, key `user:customer:{userId}`)
  4. Creates `stripe.paymentIntents.create()` with metadata `{ senderId, receiverId, amount, currency, type: 'tip' }`
  5. Creates `Tip` record in DB with `status: 'pending'` and `platformFee: amount * 0.10`
  6. Stores Redis mapping `payment_intent:{stripeId}` -> `tipId` (30-day TTL)
  7. Returns `{ clientSecret, amount, currency, tipId }` to client

**Step 2: Client Confirms Payment**
- Client uses Stripe SDK with `clientSecret` to confirm payment (card form, Apple Pay, etc.)

**Step 3: Webhook Completion**
- Stripe fires `payment_intent.succeeded` webhook
- `stripe-webhook.controller.ts` L82-86 dispatches to `handlePaymentIntentSucceeded()`
- `payments.service.ts` L380-414:
  1. Looks up tipId from Redis key `payment_intent:{paymentIntent.id}`
  2. If Redis miss: falls back to DB query via `senderId` from metadata (finds latest pending tip)
  3. Updates `Tip.status` to `'completed'`
  4. Cleans up Redis mapping

### 4.2 Platform Fee Calculation

**File:** `monetization.service.ts` L62-63 (Decimal-safe):
```typescript
const decAmount = new Decimal(amount);
const decFee = decAmount.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2); // 10% fee, rounded to 2 decimal places
```

**File:** `payments.service.ts` L168 (floating point):
```typescript
platformFee: amount * 0.10 // NOTE: not using Decimal — potential floating point drift
```

**BUG:** The monetization service uses `@prisma/client/runtime/library Decimal` for precise financial math. The payments service uses raw floating point multiplication. These should both use Decimal.

### 4.3 Alternative Tip Path (Non-Stripe)

- Client can also call `POST /monetization/tips` directly (monetization.controller.ts L57-69)
- This creates a tip record with `status: 'pending'` via `monetization.service.ts` L46-87
- Uses `Decimal` for precise fee calculation
- Does NOT create a Stripe PaymentIntent — tip stays pending forever unless manually completed
- This path appears to be for future payment methods (Apple IAP, etc.)

---

## 5. Gift System

### 5.1 Gift Catalog (8 items)

**File:** `apps/api/src/modules/gifts/gifts.service.ts` L29-38

| Type | Name | Coin Cost | Animation | Diamonds Earned (0.7x) |
|------|------|-----------|-----------|----------------------|
| `rose` | Rose | 1 | float | 0 |
| `heart` | Heart | 5 | pulse | 3 |
| `star` | Star | 10 | spin | 7 |
| `crescent` | Crescent Moon | 50 | glow | 35 |
| `mosque` | Mosque | 100 | rise | 70 |
| `diamond` | Diamond | 500 | sparkle | 350 |
| `crown` | Crown | 1,000 | drop | 700 |
| `galaxy` | Galaxy | 5,000 | explode | 3,500 |

### 5.2 Coin Purchase Flow

**File:** `gifts.service.ts` L72-103

1. Client calls `POST /gifts/purchase` with `{ amount }` (1-100,000 coins)
2. Creates `CoinTransaction` record with `type: 'PURCHASE'` and description `"Coin purchase pending payment"`
3. **DOES NOT credit coins** -- coins must be credited via Stripe webhook
4. Returns current balance + `pendingPurchase` amount + `transactionId`

**KNOWN BUG:** There is no Stripe PaymentIntent created during purchase. The `purchaseCoins` method creates a pending transaction record but there is no webhook handler (`handleGiftPaymentIntentSucceeded`) to actually credit the coins after payment. The coins are never delivered. This is documented as Critical Bug #3 in CLAUDE.md.

### 5.3 Send Gift Flow (Atomic)

**File:** `gifts.service.ts` L105-182

1. Validates: `senderId !== receiverId`, gift type exists in catalog, receiver exists
2. Calculates diamonds: `diamondsEarned = Math.floor(catalogItem.coins * DIAMOND_RATE)` (70% rate)
3. **Atomic balance deduct** via conditional `updateMany`:
   ```typescript
   // L131-134 — only deducts if balance >= cost, prevents race conditions
   const deducted = await this.prisma.coinBalance.updateMany({
     where: { userId: senderId, coins: { gte: catalogItem.coins } },
     data: { coins: { decrement: catalogItem.coins } },
   });
   ```
4. If `deducted.count === 0`: throws `BadRequestException('Insufficient coins')`
5. Executes `$transaction` with 4 operations:
   - Creates `GiftRecord` (sender, receiver, giftType, coinCost, contentId, contentType)
   - Upserts receiver's `CoinBalance` to increment diamonds
   - Creates sender `CoinTransaction` (`type: GIFT_SENT`, amount: `-catalogItem.coins`)
   - Creates receiver `CoinTransaction` (`type: GIFT_RECEIVED`, amount: `+diamondsEarned`)
6. Returns `{ gift, giftName, animation, coinCost, diamondsEarned }`

### 5.4 Diamond Conversion Rate

```
Creator receives: Math.floor(coinCost * 0.7) diamonds
Platform takes:   ~30% implicit cut (no explicit record, just the difference)

Examples:
  Rose (1 coin)    -> 0 diamonds  (floor(1 * 0.7) = 0 -- creator gets nothing!)
  Heart (5 coins)  -> 3 diamonds  (floor(5 * 0.7) = 3)
  Galaxy (5000)    -> 3500 diamonds (floor(5000 * 0.7) = 3500)
```

**NOTE:** The Rose gift (1 coin) yields 0 diamonds for the receiver due to `Math.floor()`. The sender pays 1 coin but the receiver gets nothing. This is a design issue for the cheapest gift.

---

## 6. Cashout System

### 6.1 Monetization Wallet Cashout

**File:** `monetization.service.ts` L464-519

**Validation:**
- `diamonds` must be a positive integer (L467-469)
- Minimum: `MIN_CASHOUT_DIAMONDS = 100` diamonds (L471-475)
- `paymentMethodId` required and non-empty (L477-479)
- `payoutSpeed` must be `'instant'` or `'standard'` (L481-483)

**USD Conversion Formula:**
```typescript
const usdCents = Math.floor(diamonds / DIAMONDS_PER_USD_CENT);  // DIAMONDS_PER_USD_CENT = 100/70 ≈ 1.4286
const usdAmount = usdCents / 100;

// Example: 100 diamonds
// usdCents = Math.floor(100 / 1.4286) = Math.floor(70) = 70
// usdAmount = 70 / 100 = $0.70
```

**Atomic Decrement** (L497-504):
```typescript
const updated = await this.prisma.coinBalance.updateMany({
  where: { userId, diamonds: { gte: diamonds } },
  data: { diamonds: { decrement: diamonds } },
});
if (updated.count === 0) {
  throw new BadRequestException('Insufficient diamonds');
}
```

**Records:** Creates `CoinTransaction` with `type: 'CASHOUT'`, `amount: -diamonds`

**IMPORTANT:** This endpoint does NOT actually trigger a Stripe payout. It only decrements diamonds and records the transaction. The `paymentMethodId` and `payoutSpeed` parameters are accepted but not used for actual payout processing. Real Stripe Connect payout integration is not built.

### 6.2 Gifts Module Cashout

**File:** `gifts.service.ts` L268-319

Nearly identical logic to monetization cashout but:
- Only takes `diamonds` parameter (no paymentMethodId or payoutSpeed)
- Returns `{ diamondsDeducted, usdAmount, remainingDiamonds }` (re-reads balance after update)
- Same atomic decrement pattern with `updateMany` + `gte` guard

**NOTE:** Two cashout endpoints exist: `/monetization/wallet/cashout` and `/gifts/cashout`. They operate on the same `CoinBalance` table. The monetization version accepts payment method details (for future Stripe Connect); the gifts version is simpler.

---

## 7. Membership Tiers & Subscriptions

### 7.1 Tier CRUD

**File:** `monetization.service.ts`

| Operation | Method | Line | Key Logic |
|-----------|--------|------|-----------|
| Create | `createTier()` | L201-228 | Price $0.50-$10,000. Level defaults to 'bronze'. |
| Read | `getUserTiers()` | L230-237 | Returns active tiers sorted by price ASC, max 50 |
| Update | `updateTier()` | L239-265 | Owner check. Spreads only provided fields. |
| Delete | `deleteTier()` | L267-286 | Owner check. Fails if active subscriptions exist. |
| Toggle | `toggleTier()` | L288-303 | Flips `isActive` boolean. |

**Tier Levels:** `bronze`, `silver`, `gold`, `platinum` (validated at L211)

### 7.2 Subscription Flow

**Local Subscribe** (`monetization.service.ts` L305-352):
1. Validates tier exists, is active, not self-subscription
2. Checks existing subscription -- if expired, marks as expired and allows re-subscribe
3. Creates/upserts `MembershipSubscription` with `status: 'pending'`, `endDate: now + 30 days`
4. Does NOT create Stripe subscription

**Stripe Subscribe** (`payments.service.ts` L184-284):
1. Validates tier, gets/creates Stripe customer
2. Attaches payment method, sets as default invoice payment method
3. Creates Stripe Product for the tier
4. Creates Stripe Subscription with `price_data` (monthly recurring, tier price in cents)
5. Stores bi-directional Redis mapping:
   - `subscription:{stripeSubId}` -> `dbSubscriptionId` (1-year TTL)
   - `subscription:internal:{dbSubId}` -> `stripeSubId` (1-year TTL)
6. Returns `{ subscriptionId, status, clientSecret, currentPeriodEnd }`

**Cancel** (`payments.service.ts` L286-341):
1. Resolves ID (Stripe `sub_*` prefix or internal ID) via Redis mappings
2. Cancels on Stripe first; if Stripe fails, marks as `cancel_pending`
3. Updates local record to `cancelled`, sets `endDate: now`
4. Cleans up both Redis mapping keys

### 7.3 Subscription Status Flow

```
pending -> active (via invoice.paid webhook)
active -> past_due (via invoice.payment_failed webhook)
active -> cancelled (via subscription.deleted webhook or manual cancel)
pending -> expired (if endDate passes, checked on re-subscribe)
any -> paused (via subscription.updated webhook with Stripe 'paused' status)
```

---

## 8. Stripe Webhook Handler

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`
**Endpoint:** `POST /api/v1/payments/webhooks/stripe`

### 8.1 Security & Idempotency

- **Signature verification** (L62-67): `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`
- **Idempotency** (L70-77): Redis key `stripe_webhook:{event.id}` with 7-day TTL (604,800 seconds)
- **Raw body parsing**: Requires `rawBody` on the request (must be configured in NestJS middleware)

### 8.2 Handled Event Types (8)

**File:** `stripe-webhook.controller.ts` L81-124, handlers in `payments.service.ts`

| # | Event Type | Handler Method | Service Line | Actions |
|---|-----------|---------------|-------------|---------|
| 1 | `payment_intent.succeeded` | `handlePaymentIntentSucceeded()` | L380-414 | Finds tip via Redis (fallback: DB by senderId), marks tip `completed`, cleans Redis |
| 2 | `payment_intent.payment_failed` | `handlePaymentIntentFailed()` | L493-528 | Finds tip via Redis (fallback: DB), marks tip `failed` with failure message, cleans Redis |
| 3 | `invoice.paid` | `handleInvoicePaid()` | L416-461 | Finds subscription via Redis (fallback: DB by userId+tierId), retrieves Stripe sub for period end, marks `active` with new endDate |
| 4 | `invoice.payment_failed` | `handleInvoicePaymentFailed()` | L530-547 | Finds subscription via Redis, marks `past_due` |
| 5 | `customer.subscription.deleted` | `handleSubscriptionDeleted()` | L463-491 | Finds subscription via Redis (fallback: DB), marks `cancelled`, cleans both Redis mapping keys |
| 6 | `customer.subscription.updated` | `handleSubscriptionUpdated()` | L549-588 | Maps Stripe status to internal status (active/past_due/cancelled/paused), updates endDate |
| 7 | `charge.dispute.created` | `handleDisputeCreated()` | L590-616 | Logs dispute details, finds tip via Redis, marks as `disputed` |
| 8 | `payment_method.attached` | (inline) | L117-120 | Informational log only -- no action |

### 8.3 Status Mapping (Stripe -> Internal)

**File:** `payments.service.ts` L569-576

```typescript
const statusMap: Record<string, string> = {
  active: 'active',
  past_due: 'past_due',
  canceled: 'cancelled',    // Note: Stripe uses 'canceled' (one L), we use 'cancelled' (two L's)
  unpaid: 'past_due',
  paused: 'paused',
};
```

### 8.4 Redis Key Schema (Payments)

| Key Pattern | Value | TTL | Set At |
|------------|-------|-----|--------|
| `user:customer:{userId}` | Stripe customer ID | 30 days | `getOrCreateStripeCustomer()` L76 |
| `payment_intent:{stripePaymentIntentId}` | Tip ID | 30 days | `storePaymentIntentMapping()` L85 |
| `subscription:{stripeSubscriptionId}` | Internal subscription ID | 1 year | `storeSubscriptionMapping()` L94 |
| `subscription:internal:{internalSubId}` | Stripe subscription ID | 1 year | `storeSubscriptionMapping()` L95 |
| `stripe_webhook:{eventId}` | `'1'` | 7 days | Webhook idempotency L77 |

---

## 9. Wallet Endpoints (Detail)

### 9.1 Get Balance

**File:** `monetization.service.ts` L420-432

```typescript
async getWalletBalance(userId: string) {
  const balance = await this.prisma.coinBalance.upsert({
    where: { userId },
    update: {},
    create: { userId, coins: 0, diamonds: 0 },
  });
  return {
    diamonds: balance.diamonds,
    usdEquivalent: Math.round(balance.diamonds * DIAMOND_TO_USD * 100) / 100,
    diamondToUsdRate: DIAMOND_TO_USD,
  };
}
```

Note: Uses `upsert` with empty `update` to ensure CoinBalance row exists (auto-creates if missing).

### 9.2 Get Payment Methods -- PLACEHOLDER

**File:** `monetization.service.ts` L434-462

This is explicitly documented as a placeholder:
1. Looks up `user.stripeConnectAccountId`
2. If present: returns a single hardcoded entry `{ id, type: 'stripe', label: 'Stripe Account', lastFour: '****', isDefault: true }`
3. If absent: returns empty array `[]`
4. Does NOT call Stripe API to list actual external accounts
5. Comment at L448: "In production, this would call Stripe API to list external accounts"

### 9.3 Cashout (See Section 6.1)

### 9.4 Payout History

**File:** `monetization.service.ts` L521-555

Queries `CoinTransaction` where `type = 'CASHOUT'`, maps to:
```typescript
{
  id: tx.id,
  amount: Math.abs(tx.amount) * DIAMOND_TO_USD,  // Convert diamonds back to USD
  currency: tx.currency,
  status: 'completed',                             // Always hardcoded as 'completed'
  createdAt: tx.createdAt.toISOString(),
}
```

**NOTE:** Status is always `'completed'` -- there is no pending/failed payout tracking because actual Stripe payouts are not implemented.

---

## 10. Commerce Module -- Detailed Flows

### 10.1 Product CRUD

**File:** `commerce.service.ts`

**Create** (L39-51):
- Required: title, description, price, images[], category
- Optional: currency (default USD), isHalal, isMuslimOwned, stock (default 1), tags[], location, shippingInfo, halalCertUrl
- Supported currencies: USD, EUR, GBP, SAR, AED, MYR, IDR, TRY, BDT, PKR (10 currencies, validated in DTO)
- Categories: `ProductCategory` Prisma enum

**Update** (L81-102):
- Owner check via `sellerId !== userId`
- Valid statuses: ACTIVE, DRAFT, SOLD_OUT, REMOVED

**Delete** (L104-119):
- Owner check
- Fails if active orders exist (PENDING, PAID, or SHIPPED)

**Review** (L121-147):
- Rating 1-5, optional comment
- Self-review prevented
- Unique constraint on `(productId, userId)` -- P2002 error caught
- Auto-updates product's `rating` (avg) and `reviewCount` via aggregate

### 10.2 Order Flow with Stripe

**File:** `commerce.service.ts` L151-252

**Step 1: Create Order**
1. Validates: product exists, is ACTIVE, not self-purchase
2. Validates quantity (1-100), checks stock
3. Validates installments (1-4)
4. Calculates `totalAmount = price * quantity`
5. Creates Stripe PaymentIntent:
   - `amount`: totalAmount in cents
   - `metadata`: `{ orderId: 'pending', productId, buyerId, sellerId, type: 'marketplace_order' }`
6. Runs `$transaction`:
   - **Atomic stock decrement**: `product.updateMany({ where: { id, stock: { gte: qty }, status: ACTIVE }, data: { stock: { decrement: qty }, salesCount: { increment: qty } } })`
   - If `updated.count === 0`: product unavailable or out of stock
   - Creates `Order` record with `stripePaymentId: paymentIntent.id`
7. If transaction fails: cancels the PaymentIntent (cleanup)
8. Updates PaymentIntent metadata with real `orderId`
9. Fire-and-forget notification to seller
10. Returns `{ order, clientSecret }`

**Step 2: Order Status Transitions**

```
PENDING -> PAID | CANCELLED
PAID -> SHIPPED | REFUNDED
SHIPPED -> DELIVERED
DELIVERED -> (terminal)
CANCELLED -> (terminal)
REFUNDED -> (terminal)
```

On CANCELLED/REFUNDED: atomically restores stock and decrements salesCount (L313-317).

### 10.3 Halal Business Directory

**File:** `commerce.service.ts` L338-415

- CRUD for `HalalBusiness` model
- Owner is `ownerId` (not `userId`)
- Categories: `HalalCategory` Prisma enum
- Location support: `lat`, `lng` in DTO (but no geo-query/PostGIS -- just stored)
- Reviews: same pattern as products (unique per user, auto-updates avg rating)
- Business review uses `BusinessReview` model

### 10.4 Zakat Funds

**File:** `commerce.service.ts` L419-465

- Fund created by `recipientId` (the person/org receiving zakat)
- Categories: `ZakatCategory` enum (INDIVIDUAL, MOSQUE, SCHOOL, DISASTER, ORPHAN, OTHER)
- Donations created as pending (no payment confirmation flow)
- Self-donation prevented
- **No atomic raisedAmount increment** -- donation is just recorded

### 10.5 Waqf Funds (Endowment)

**File:** `commerce.service.ts` L543-597

- Browse active waqf funds (L543-557)
- Contribute (L559-597):
  - Self-contribution prevented
  - **Atomic raisedAmount** via `$transaction`: re-checks `isActive`, increments `raisedAmount`
  - Auto-deactivates fund when `raisedAmount >= goalAmount`

### 10.6 Community Treasury

**File:** `commerce.service.ts` L469-539

- Requires circle membership (both create and contribute)
- Goal tracking with `raisedAmount` and `goalAmount`
- **Atomic contribution** via `$transaction`:
  - Re-checks treasury status
  - Creates `TreasuryContribution` record
  - Increments `raisedAmount`
  - Auto-completes if goal reached
- Over-goal contribution check at L504: rejects if `raisedAmount >= goalAmount`

### 10.7 Premium Subscriptions

**File:** `commerce.service.ts` L601-628

| Plan | Duration | Comment |
|------|----------|---------|
| `monthly` | 1 month | `endDate.setMonth(now + 1)` |
| `yearly` | 12 months | `endDate.setMonth(now + 12)` |

- Status is set to `ACTIVE` immediately on subscribe (L616-617)
- Comment says "should be activated via payment webhook" but code sets ACTIVE immediately
- **BUG:** Premium is activated without payment confirmation. The upsert sets `status: SubscriptionStatus.ACTIVE` in both create and update paths, meaning premium is immediately granted without any Stripe charge.

---

## 11. DTOs (Validation Rules)

**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`

| DTO | Fields | Key Validations |
|-----|--------|----------------|
| `CreateProductDto` | 13 fields | title: max 200, price: 0.01-1M, images: max 10 URLs, stock: 0-100K |
| `UpdateProductDto` | 14 fields | All optional, status: ACTIVE/DRAFT/SOLD_OUT/REMOVED |
| `ReviewDto` | rating, comment | rating: 1-5 (integer), comment: max 500 |
| `CreateOrderDto` | 4 fields | quantity: 1-100, installments: 1-4 |
| `UpdateOrderStatusDto` | status | PENDING/PAID/SHIPPED/DELIVERED/CANCELLED/REFUNDED |
| `CreateBusinessDto` | 12 fields | name: max 200, phone: regex `^\+?[\d\s\-()]+$`, lat: -90..90, lng: -180..180 |
| `UpdateBusinessDto` | 12 fields | All optional, same validations |
| `CreateZakatFundDto` | 5 fields | goalAmount: 1-10M, category: 6 options |
| `DonateZakatDto` | amount, isAnonymous | amount: 0.01-1M |
| `CreateTreasuryDto` | 5 fields | goalAmount: 1-10M |
| `ContributeTreasuryDto` | amount | amount: 0.01-1M |
| `SubscribePremiumDto` | plan | monthly or yearly |

**Monetization DTOs** (inline in controller, L23-48):
| DTO | Key Validations |
|-----|----------------|
| `WalletCashoutDto` | amount: 100-10M (diamonds), payoutSpeed: instant/standard, paymentMethodId: max 200 |
| `CreateTipDto` | receiverId: max 50, amount: $0.50-$10K, message?: max 500 |
| `CreateTierDto` | name: max 100, price: $0.50-$10K, benefits: max 20 strings, level?: bronze/silver/gold/platinum |
| `UpdateTierDto` | All optional, same validations |

**Gifts DTOs** (inline in controller, L18-31):
| DTO | Key Validations |
|-----|----------------|
| `PurchaseCoinsDto` | amount: 1-100K (integer) |
| `SendGiftDto` | receiverId: max 50, giftType: max 30, contentId?: max 50, contentType?: max 30 |
| `CashoutDto` | diamonds: 100-10M (integer) |

---

## 12. Known Bugs & Design Issues

### 12.1 CRITICAL: Coin Purchase Webhook NOT Crediting (Bug #3)

**Location:** `gifts.service.ts` L72-103 (`purchaseCoins`)

The `purchaseCoins` method creates a pending `CoinTransaction` record but there is **no corresponding webhook handler** to credit the coins after Stripe payment succeeds. The `handlePaymentIntentSucceeded` in `payments.service.ts` only handles tip completion -- it does not check for coin purchase transactions.

**Impact:** Users who purchase coins via Stripe will never receive them. The payment goes through on Stripe's side but the `CoinBalance.coins` is never incremented.

**Fix needed:** Either:
- Add a separate PaymentIntent metadata type `'coin_purchase'` and handle it in the webhook
- Or create a dedicated coin purchase PaymentIntent flow with its own webhook handler

### 12.2 CRITICAL: Waqf Contribution Endpoint Exists but Was Documented as Missing

**Location:** `commerce.controller.ts` L193-199, `commerce.service.ts` L559-597

The CLAUDE.md Bug #4 states "POST /community/waqf/{id}/contribute doesn't exist." However, the endpoint **does exist** at `POST /waqf/funds/:id/contribute` (L193-199). The route path is different from what was expected -- it's `/waqf/funds/:id/contribute`, not `/community/waqf/{id}/contribute`. This may be a routing/documentation mismatch rather than a missing endpoint.

### 12.3 Dual CoinBalance System (Bug #5)

**Location:** `gifts.service.ts` L50-53 (comment)

```typescript
// IMPORTANT: The coin/diamond balance is stored in the CoinBalance table (this service).
// The User model also has a legacy `coinBalance` Int field — that field is NOT used by this
// service and should NOT be relied upon. All coin operations go through CoinBalance.
// Reconciliation: if any code reads User.coinBalance, it gets a stale/wrong value.
```

All four modules use the `CoinBalance` table correctly. The risk is other modules reading `User.coinBalance` instead.

### 12.4 Platform Fee Precision Mismatch

- `monetization.service.ts` L62-63: Uses `Decimal` (precise) for fee calculation
- `payments.service.ts` L168: Uses `amount * 0.10` (floating point, potential drift)

### 12.5 Premium Activated Without Payment

**Location:** `commerce.service.ts` L614-618

Premium subscription is set to `ACTIVE` immediately on `subscribePremium()` without creating a Stripe charge or subscription. Comment says "should be activated via payment webhook" but code grants it immediately.

### 12.6 Rose Gift Yields 0 Diamonds

**Location:** `gifts.service.ts` L127, catalog L30

`Math.floor(1 * 0.7) = 0` -- the cheapest gift (Rose, 1 coin) gives the receiver zero diamonds.

### 12.7 Duplicate Cashout Endpoints

Both `/monetization/wallet/cashout` and `/gifts/cashout` exist and operate on the same `CoinBalance` table. They have slightly different request/response shapes but identical core logic.

### 12.8 Payment Methods Placeholder (Not Real)

**Location:** `monetization.service.ts` L434-462

`getPaymentMethods()` returns a hardcoded stub if user has `stripeConnectAccountId`, not actual Stripe-fetched payment methods.

### 12.9 Payout Not Actually Processed

Neither cashout endpoint (`/monetization/wallet/cashout` nor `/gifts/cashout`) actually triggers a Stripe payout/transfer. They only decrement diamonds and record a transaction. Real money never moves.

### 12.10 Zakat Donation No Payment Flow

`donateZakat()` at `commerce.service.ts` L445-465 creates a donation record but there is no Stripe PaymentIntent, no webhook to confirm payment, and no atomic increment of `raisedAmount`. The donation amount is not verified against actual payment.

---

## 13. Test Coverage Summary

| Module | Test Files | Total Lines | Coverage Areas |
|--------|-----------|-------------|---------------|
| Monetization | 2 (controller + service) | 1,153 | Tips CRUD, tier CRUD, subscriptions, wallet, cashout |
| Payments | 3 (controller + service + edge) | 555 | PaymentIntent, subscriptions, cancel, webhook events |
| Gifts | 6 (controller + service + edge + auth + abuse + concurrency) | 636 | Balance, purchase, send, catalog, cashout, race conditions |
| Commerce | 3 (controller + service + edge) | 548 | Products, orders, businesses, zakat, waqf, premium |
| **TOTAL** | **14 test files** | **2,892 lines** | |

Notable: Gifts module has the most test files (6), including dedicated `concurrency.spec.ts` for race condition testing and `abuse.spec.ts` for abuse prevention.

---

## 14. Architecture Diagrams

### 14.1 Money Flow

```
User Wallet                    Creator Wallet
┌──────────────┐               ┌──────────────────┐
│ coins: Int   │               │ diamonds: Int     │
│ diamonds: Int│               │                   │
└──────┬───────┘               └────────▲──────────┘
       │                                │
       │ sendGift()                     │ increment diamonds
       │ atomic: coins -= cost          │ (floor(cost * 0.7))
       │                                │
       ▼                                │
┌──────────────────────────────────────┐│
│        GiftRecord                     ││
│  senderId, receiverId, giftType,      ││
│  coinCost, contentId, contentType     │┘
└───────────────────────────────────────┘

Cashout Flow:
  diamonds -> Math.floor(diamonds / 1.4286) cents -> USD
  100 diamonds = $0.70
  Atomic: CoinBalance.updateMany({ where: { diamonds: { gte: N } } })
  Records: CoinTransaction(type: CASHOUT, amount: -N)
  NOTE: No actual Stripe payout triggered
```

### 14.2 Stripe Integration Flow

```
Mobile Client                    API Server                      Stripe
     │                               │                              │
     │  POST /payments/              │                              │
     │  create-payment-intent        │                              │
     │──────────────────────────────>│                              │
     │                               │  stripe.paymentIntents       │
     │                               │  .create()                   │
     │                               │─────────────────────────────>│
     │                               │                              │
     │                               │  { id, client_secret }       │
     │                               │<─────────────────────────────│
     │                               │                              │
     │                               │  Redis: pi:{id} -> tipId     │
     │                               │  DB: Tip(status: pending)    │
     │                               │                              │
     │  { clientSecret, tipId }      │                              │
     │<──────────────────────────────│                              │
     │                               │                              │
     │  Stripe SDK confirmPayment    │                              │
     │──────────────────────────────────────────────────────────────>│
     │                               │                              │
     │                               │  payment_intent.succeeded    │
     │                               │<─────────────────────────────│
     │                               │                              │
     │                               │  Idempotency check (Redis)   │
     │                               │  Redis: pi:{id} -> tipId     │
     │                               │  DB: Tip.status = completed  │
     │                               │                              │
```

### 14.3 Subscription Lifecycle

```
POST /payments/create-subscription
  │
  ▼
getOrCreateStripeCustomer() ──> Redis cache (30d TTL)
  │
  ▼
stripe.paymentMethods.attach() + set default
  │
  ▼
stripe.products.create() + stripe.subscriptions.create()
  │
  ▼
DB: MembershipSubscription(status: pending)
Redis: subscription:{stripeId} <-> internal:{dbId} (1yr TTL)
  │
  ▼
[Stripe webhook: invoice.paid]
  │
  ▼
DB: MembershipSubscription(status: active, endDate: period_end)
  │
  ▼ [Monthly renewal]
[Stripe webhook: invoice.paid]  ──> Extend endDate
[Stripe webhook: invoice.payment_failed] ──> status: past_due
[Stripe webhook: customer.subscription.deleted] ──> status: cancelled
[Stripe webhook: customer.subscription.updated] ──> sync status + endDate
```
