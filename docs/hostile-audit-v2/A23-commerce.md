# A23: Commerce & Marketplace Audit

**Scope:** `apps/api/src/modules/commerce/` (7 files) + `apps/api/src/modules/monetization/` (5 files)
**Auditor:** Hostile code audit
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] A23-01 — Stripe PaymentIntent created BEFORE atomic stock check, orphan possible on race

**File:** `commerce.service.ts` lines 191-249
**Detail:** `createOrder` creates a Stripe PaymentIntent (line 192) BEFORE the `$transaction` that atomically checks stock (line 214). If the transaction throws due to insufficient stock (line 222), the catch block at line 241 attempts to cancel the PaymentIntent. However:

1. If `stripe.paymentIntents.cancel()` itself fails (network error, Stripe outage), the PaymentIntent remains alive. The catch at line 244 only logs a warning -- the original `InternalServerErrorException` is still thrown, but the PI is leaked.
2. More critically: between `paymentIntents.create()` and the `$transaction`, the client receives no response yet but a PaymentIntent ID has been minted. If the server crashes or the request times out after line 208 but before line 240, the PI exists with no corresponding order. There is no reconciliation job to clean up orphaned PIs.
3. The `metadata.orderId` is initially `'pending'` (line 198). The post-transaction metadata update at line 253 can silently fail (caught at line 256). If it fails, the webhook handler must fall back to `findFirst({ where: { stripePaymentId } })` which is a table scan without a unique index on `stripePaymentId` in the Order model (schema line 4199: `stripePaymentId String?` -- no `@unique`).

**Impact:** Leaked PaymentIntents that could be charged by the client without a corresponding order. Missing unique index on `stripePaymentId` means webhook fallback query is O(n).

---

### [CRITICAL] A23-02 — No purchase verification required to review a product

**File:** `commerce.service.ts` lines 135-164
**Detail:** `reviewProduct` checks that the reviewer is not the seller (line 143) and handles duplicate reviews via P2002 (line 151), but it does NOT verify that the reviewer has ever purchased the product. Any authenticated user can review any product. The same applies to `reviewBusiness` (lines 421-448) -- no verification that the reviewer has ever interacted with the business.

**Impact:** Fake review manipulation. A seller could create alt accounts and post 5-star reviews, or competitors could post 1-star reviews. The `@@unique([productId, userId])` constraint on `ProductReview` only prevents multiple reviews per user, not fake reviews from non-buyers.

---

### [HIGH] A23-03 — HalalBusiness category not validated against Prisma enum

**File:** `commerce.service.ts` line 400 (`createBusiness`) and line 465 (`updateBusiness`)
**Detail:** `createProduct` properly validates the category against `Object.values(ProductCategory)` at lines 51-54. However, `createBusiness` at line 400 directly casts `dto.category as HalalCategory` without any validation. Similarly, `updateBusiness` at line 465 casts without validation. If a user sends `category: "HACKED"`, Prisma will throw a database error instead of a clean 400 response.

The `CreateBusinessDto` at `commerce.dto.ts` line 62 only has `@IsString() @MaxLength(50)` on `category` -- no `@IsIn()` validation against `HalalCategory` enum values. Same gap in `UpdateBusinessDto` line 78.

**Impact:** Invalid enum values reach Prisma, causing unhandled database errors (500 instead of 400). Not a security breach per se, but violates the pattern established by `createProduct` and leaks internal Prisma error details.

---

### [HIGH] A23-04 — Subscription created as 'pending' but no payment gateway wired; subscription abuse possible

**File:** `monetization.service.ts` lines 302-349
**Detail:** `subscribe()` creates a MembershipSubscription with `status: 'pending'` and a 30-day `endDate`. The comment on line 335 says "should be activated via payment webhook". However:

1. No Stripe PaymentIntent or checkout session is created -- the subscription is created for free.
2. `getUserTiers()` at line 228 filters by `isActive: true` but does NOT check subscription status when returning tiers.
3. If the mobile app checks subscription status by looking at the `MembershipSubscription` record existing with a non-expired `endDate`, users get 30 days of access without paying.
4. The `unsubscribe()` method (line 351) only checks `status !== 'active'` but a 'pending' subscription with a valid `endDate` could be exploited depending on how the mobile client interprets the record.

**Impact:** Users can subscribe to tiers without paying, potentially accessing exclusive content for 30 days.

---

### [HIGH] A23-05 — Premium subscription activated as PENDING without requiring payment confirmation

**File:** `commerce.service.ts` lines 694-731
**Detail:** `subscribePremium` creates a `PremiumSubscription` with `status: SubscriptionStatus.PENDING` (line 726) and returns a `clientSecret` for Stripe payment. This is correct -- the subscription should only become ACTIVE via the webhook at `handlePremiumPaymentSucceeded`.

However, when Stripe is NOT available (`this.stripeAvailable === false`), the code at lines 703-721 sets `clientSecret = null` and still creates the PENDING subscription record at line 724. The mobile client receives `{ ...sub, clientSecret: null }`. If the mobile app does not enforce that `clientSecret` must be non-null before granting access, users get a subscription record without ever paying.

Additionally, `subscribePremium` uses `upsert` (line 724) which means a user whose previous subscription was CANCELLED can call this endpoint repeatedly. Each call creates a new Stripe PI (potential PI leak) and resets the subscription to PENDING.

**Impact:** Potential free premium access when Stripe is not configured. Repeated calls leak PaymentIntents.

---

### [HIGH] A23-06 — Seller analytics counts ALL orders regardless of payment status

**File:** `commerce.service.ts` lines 313-335
**Detail:** `getSellerAnalytics` calculates `totalOrders` using `this.prisma.order.count({ where: { product: { sellerId } } })` at line 322 -- this counts ALL orders including PENDING, CANCELLED, and REFUNDED. The `totalRevenue` correctly filters by `status: 'PAID'` at line 324. However, `topProducts` at line 318 uses `salesCount` which is incremented during `createOrder` (line 219) BEFORE payment is confirmed, and decremented only on CANCELLED/REFUNDED (line 370).

If a product gets 100 orders that are all cancelled, `salesCount` should return to 0, but `orderCount` on line 322 shows 100. More importantly, if any cancellation/refund fails to decrement `salesCount` (e.g., the `salesCount: { gt: 0 }` guard at line 369 prevents decrement when it's already 0 from a previous bug), the `salesCount` drifts permanently.

**Impact:** Inflated seller metrics. `totalOrders` includes unpaid/cancelled orders, and `salesCount` can drift if guard condition triggers incorrectly.

---

### [HIGH] A23-07 — `getSellerOrders` status filter not validated against OrderStatus enum

**File:** `commerce.service.ts` lines 289-308, `commerce.controller.ts` lines 96-105
**Detail:** The controller passes `@Query('status') status?: string` directly to `getSellerOrders` (line 104). The service at line 292 does `if (status) where.status = status;` without validating that `status` is a valid `OrderStatus` enum value. A malicious seller could pass `status=NONEXISTENT` which would cause Prisma to throw an unhandled database error (since `OrderStatus` is an enum at the DB level).

Contrast this with `updateOrderStatus` at line 338-339 which properly validates against `VALID_STATUSES`.

**Impact:** Unhandled Prisma errors leak internal details in 500 responses.

---

### [MEDIUM] A23-08 — Review endpoints missing dedicated @Throttle -- 30 req/min allows rapid review bombing

**File:** `commerce.controller.ts` lines 72-77 (reviewProduct) and lines 162-167 (reviewBusiness)
**Detail:** Neither `reviewProduct` nor `reviewBusiness` has a dedicated `@Throttle` decorator. They inherit the class-level default of 30 requests per 60 seconds (line 23). While the `@@unique([productId, userId])` constraint prevents duplicate reviews on the SAME product, a user can post reviews on 30 different products per minute. For review bombing across many products (e.g., a competitor mass-reviewing all of a seller's products), the class-level rate limit is too permissive.

Mutation endpoints like `createProduct`, `createOrder`, `createBusiness` all have dedicated `@Throttle({ default: { limit: 10, ttl: 60000 } })` or `@Throttle({ default: { limit: 5, ttl: 60000 } })`.

**Impact:** A single authenticated user can post reviews on 30 products/businesses per minute -- enough for systematic rating manipulation.

---

### [MEDIUM] A23-09 — No seller verification or minimum requirements before listing products

**File:** `commerce.service.ts` lines 42-59
**Detail:** `createProduct` allows ANY authenticated user to create a product listing immediately. There is no:
- Minimum account age check
- Email verification check
- Identity/KYC verification
- Minimum profile completeness check
- `isVerified` check on the user

The `HalalBusiness` model has `isVerified Boolean @default(false)` (schema line 4239) but this is never checked in `createBusiness` either (service line 394-402). Products don't have a similar verification field.

**Impact:** Newly created accounts can immediately list products, enabling scam listings. The marketplace has no trust signals beyond seller review scores.

---

### [MEDIUM] A23-10 — Zakat/Waqf/Treasury donation code is dead but unreachable validation logic has bugs

**File:** `commerce.service.ts` lines 510-547 (donateZakat), lines 567-624 (contributeTreasury), lines 644-685 (contributeWaqf)
**Detail:** All three methods throw `NotImplementedException` as the first statement, making all subsequent code unreachable. The unreachable code has issues that will surface when the `throw` is removed to enable the feature:

1. `donateZakat` line 519: `fund!.status !== 'active'` -- non-null assertion on a nullable value after a null check at line 518. If `fund` is null, the `NotFoundException` at line 518 handles it. But the code at line 519 uses `fund!` unnecessarily.
2. `contributeTreasury` lines 577-578: `treasury!.status` and `treasury!.circleId` use non-null assertions after an explicit null check at line 577, which is redundant but harmless.
3. `contributeWaqf` line 654: `fund!.isActive` and `fund!.createdById` -- same pattern.
4. None of the three methods create a Stripe PaymentIntent before recording the donation -- when enabled, donations will be recorded without actual payment.
5. `donateZakat` at line 524: prevents self-donation (fund creator donating to own fund), which is good. But there's no rate limit on donation creation -- a malicious user could create thousands of zero-value donations if the amount check were bypassed.

**Impact:** Low immediate impact (dead code). But the code has structural issues that will cause problems when un-stubbed. No payment integration means donations would be recorded without money changing hands.

---

### [MEDIUM] A23-11 — Monetization `subscribe` does not generate a Stripe payment intent -- free subscriptions

**File:** `monetization.service.ts` lines 302-349
**Detail:** The `subscribe` method creates a subscription record in the database with `status: 'pending'` but does NOT interact with Stripe at all -- no PaymentIntent, no checkout session, no nothing. The comment "should be activated via payment webhook" (line 335) implies a payment flow exists, but there's no code path that creates a payment for tier subscriptions.

Compare with `commerce.service.ts:subscribePremium` which DOES create a Stripe PaymentIntent (lines 704-715). The monetization tier subscription system has no payment integration whatsoever.

**Impact:** Creator tier subscriptions are effectively free. Users can subscribe to any tier without paying. The 'pending' status is meaningless without a payment workflow.

---

### [MEDIUM] A23-12 — `createProduct` stock of 0 silently becomes 1 due to falsy check

**File:** `commerce.service.ts` line 56
**Detail:** `stock: dto.stock || 1` -- JavaScript's `||` operator treats `0` as falsy. If a user explicitly sets `stock: 0` (to create a "coming soon" or "pre-order" listing), the stock is silently set to 1. The DTO at `commerce.dto.ts` line 18 allows `@Min(0)`, so `0` is a valid input that gets silently changed.

Should use nullish coalescing: `dto.stock ?? 1`.

**Impact:** Sellers cannot create pre-order/coming-soon listings with zero stock. A product intended to have 0 stock becomes purchasable with 1 unit.

---

### [MEDIUM] A23-13 — Premium cancellation does not trigger Stripe cancellation

**File:** `commerce.service.ts` lines 733-740
**Detail:** `cancelPremium` sets `autoRenew: false` and `status: CANCELLED` in the database (line 737-738), but does NOT cancel the corresponding Stripe subscription or PaymentIntent. If the user had an active Stripe subscription with auto-renewal, Stripe will continue to charge them even though the app shows "cancelled".

Similarly, `monetization.service.ts:unsubscribe` (lines 351-368) updates the DB record but does not touch Stripe.

**Impact:** Users may continue to be charged by Stripe after cancellation. Revenue leakage and potential chargeback/dispute issues.

---

### [MEDIUM] A23-14 — Cashout balance decrement is not in a transaction -- TOCTOU between check and write

**File:** `monetization.service.ts` lines 461-532 (dead code behind `NotImplementedException`)
**Detail:** The cashout code (when enabled) uses `coinBalance.updateMany` with a `WHERE diamonds >= amount` clause (line 499) which is atomic within Prisma. This is good. However:

1. The subsequent balance re-read at line 509 (`findUnique`) and the negative balance reversal at lines 512-516 are NOT in a transaction with the decrement. Between the `updateMany` and the `findUnique`, another concurrent cashout could further reduce the balance. The reversal at line 512 increments by the original amount, which could make the balance higher than it should be.
2. The entire sequence (updateMany -> findUnique -> conditional increment -> create CoinTransaction) is not atomic. A crash between `updateMany` and `create CoinTransaction` leaves the balance decremented with no transaction record.

**Impact:** Potential for balance manipulation via concurrent cashout requests when the feature is enabled.

---

### [LOW] A23-15 — `updateOrderStatus` DTO allows buyer to specify 'PAID' but transition check blocks it

**File:** `commerce.dto.ts` line 54, `commerce.service.ts` lines 337-360
**Detail:** `UpdateOrderStatusDto` allows `status: 'PAID'` in the `@IsIn` validator (line 54). The controller sends this to `updateOrderStatus`, and the service's transition table at line 353 correctly does NOT allow any seller-initiated transition TO 'PAID' (only the Stripe webhook sets PAID). So the code is safe in practice.

However, the DTO allows sending 'PAID' which passes validation, then fails at the business logic layer. This is defense-in-depth working correctly, but the DTO should not advertise 'PAID' as a valid seller action. If the transition table is ever modified, this becomes a real vulnerability.

**Impact:** No current exploit, but a fragile defense. If someone adds `PENDING: ['PAID', 'CANCELLED']` to the transition table, sellers could mark orders as paid without payment.

---

### [LOW] A23-16 — `getProducts` search uses Prisma `contains` which may bypass full-text search expectations

**File:** `commerce.service.ts` line 65
**Detail:** `where.title = { contains: search, mode: 'insensitive' }` performs a `LIKE %search%` query on PostgreSQL. This:
1. Cannot use indexes efficiently (leading wildcard).
2. Does not support multi-word search, relevance ranking, or typo tolerance.
3. At scale with thousands of products, this will be a sequential scan on every search query.

The codebase has Meilisearch configured elsewhere but products are not indexed there.

**Impact:** Performance degradation at scale. No immediate security impact.

---

### [LOW] A23-17 — `createTreasury` does not verify circle membership role (any member can create)

**File:** `commerce.service.ts` lines 551-565
**Detail:** `createTreasury` checks that the user is a member of the circle (line 555), but does not check the member's role (admin, moderator, member). Any circle member can create a treasury, including the lowest-privilege members.

**Impact:** Low-privilege circle members could spam treasury creation. No financial risk since contributions require separate payment (currently disabled), but could clutter the treasury list.

---

### [LOW] A23-18 — `deleteProduct` hard-deletes instead of soft-delete, losing order history reference

**File:** `commerce.service.ts` line 131
**Detail:** `deleteProduct` uses `prisma.product.delete()` which is a hard delete. The Prisma schema at line 4205 has `product Product @relation(fields: [productId], references: [id], onDelete: Cascade)` on Order -- meaning deleting a product cascades to DELETE all its orders. The `deleteProduct` method checks for active orders (line 124-129), but completed/delivered orders would also be deleted.

This means historical order records are permanently lost when a seller deletes their product. Buyers lose their order history.

**Impact:** Data loss. Historical orders and reviews cascade-deleted with the product.

---

### [LOW] A23-19 — Monetization wallet `getWalletBalance` creates a balance record via upsert on every read

**File:** `monetization.service.ts` lines 417-429
**Detail:** `getWalletBalance` uses `prisma.coinBalance.upsert()` which performs a write (INSERT if not exists) on every balance check. For a read-heavy endpoint, this means every balance query generates a write transaction, which:
1. Takes a write lock on the user's balance row.
2. Generates WAL entries in PostgreSQL even when the row already exists (the `update: {}` is a no-op update but still acquires a lock).
3. Under load, concurrent balance checks could contend on the same row.

Should use `findUnique` first, and only create if null.

**Impact:** Unnecessary write amplification on a read-heavy endpoint. Performance degradation under concurrent access.

---

### [INFO] A23-20 — `price` stored as `Decimal` in Prisma but handled as `number` in service

**File:** `commerce.service.ts` line 186, Prisma schema line 4150
**Detail:** The Product model uses `Decimal @db.Decimal(12, 2)` for price. Prisma returns this as a `Decimal` object, not a JavaScript `number`. The service at line 186 does `Number(product.price) * qty` to compute `totalAmount`. While this works for typical values, the explicit `Number()` conversion can lose precision for very large values (above `Number.MAX_SAFE_INTEGER`). At `Decimal(12, 2)`, the max value is `9999999999.99` which is within safe integer range when converted to cents, so this is technically safe.

The monetization service at line 427 also does `balance.diamonds * DIAMOND_TO_USD` where `diamonds` is `Int` (safe).

**Impact:** No practical risk at current scale. Noted for awareness.

---

### [INFO] A23-21 — `getPayoutHistory` hardcodes all cashout statuses as 'completed'

**File:** `monetization.service.ts` lines 556-557
**Detail:** The payout history mapping at line 558 sets `status: 'completed' as const` for every transaction, regardless of whether the actual payout succeeded. When cashouts are enabled, this will show failed or pending payouts as completed.

**Impact:** UX issue only -- users see incorrect payout status.

---

### [INFO] A23-22 — `UpdateOrderStatusDto` includes both 'PAID' and 'PENDING' which are not valid seller transitions

**File:** `commerce.dto.ts` line 54
**Detail:** The DTO allows all 6 statuses in `@IsIn`, but the service's transition table at `commerce.service.ts` lines 352-359 only allows:
- PENDING -> CANCELLED
- PAID -> SHIPPED, REFUNDED
- SHIPPED -> DELIVERED

So 'PAID', 'PENDING', 'DELIVERED', 'CANCELLED', 'REFUNDED' as inputs would all fail at the business logic layer (except the valid source->target combinations). The DTO should only allow `['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']` since 'PAID' and 'PENDING' are never valid targets for seller-initiated transitions.

**Impact:** Cosmetic/clarity issue. Defense in depth works correctly.

---

## Checklist Verification

| # | Check | Verdict | Detail |
|---|-------|---------|--------|
| 1 | **Double-spend** | PARTIAL | Stock decrement is atomic via `updateMany` with `WHERE stock >= qty` inside `$transaction` (line 216-219). However, the Stripe PI is created outside the transaction (A23-01), so a PI can exist without a valid order. Webhook idempotency at `handleMarketplaceOrderSucceeded` uses `updateMany WHERE status != PAID` which prevents double-activation. |
| 2 | **Inventory atomicity** | PASS | `product.updateMany({ where: { id, stock: { gte: qty } }, data: { stock: { decrement: qty } } })` at line 216-218 is atomic. Prisma translates this to `UPDATE products SET stock = stock - $1, "salesCount" = "salesCount" + $2 WHERE id = $3 AND stock >= $4 AND status = 'ACTIVE'`. Race-safe. |
| 3 | **Price manipulation** | PASS | `CreateOrderDto` has no `price` or `totalAmount` field (only `productId`, `quantity`, `installments`, `shippingAddress`). Price is always read from the database at line 186. Buyer cannot specify price. |
| 4 | **Seller verification** | FAIL | No verification required to list products (A23-09). Any authenticated user can create product listings immediately. No KYC, no minimum account age, no profile completeness check. |
| 5 | **Order state machine** | PASS (with caveats) | Transition table at lines 352-359 enforces: PENDING->CANCELLED, PAID->SHIPPED/REFUNDED, SHIPPED->DELIVERED. Terminal states (DELIVERED, CANCELLED, REFUNDED) have empty transition arrays. PAID is only set via Stripe webhook. However, DTO allows sending PAID as a target (A23-15, blocked at business logic). |
| 6 | **Rate limit on listing creation** | PASS | `createProduct` has `@Throttle({ default: { limit: 10, ttl: 60000 } })` at controller line 31. `createBusiness` has `@Throttle({ default: { limit: 5, ttl: 60000 } })` at line 127. Review endpoints use the class-level 30/min (A23-08). |
| 7 | **BOLA (Broken Object Level Authorization)** | PASS | `updateProduct` checks `sellerId !== userId` (line 99). `deleteProduct` checks `sellerId !== userId` (line 121). `updateBusiness` checks `ownerId !== userId` (line 461). `updateOrderStatus` checks `product.sellerId !== sellerId` (line 349). `updateTier`/`deleteTier`/`toggleTier` all check `tier.userId !== userId`. |
| 8 | **Refund/dispute resolution** | PARTIAL | Order can transition to REFUNDED via seller action (PAID->REFUNDED, line 354). Stock is restored atomically in a transaction (line 367-373). However: no buyer-initiated dispute flow, no partial refund, no actual Stripe refund issued (A23-13 pattern -- DB updated but Stripe not). The Stripe webhook handler has `charge.dispute.created` handling at `stripe-webhook.controller.ts` line 126-129. |

---

**Summary:** 22 findings total. 2 CRITICAL, 5 HIGH, 7 MEDIUM, 5 LOW, 3 INFO. Primary themes: (1) payment integration gaps where DB records are created without actual payment, (2) missing validation on enum inputs for business/order status, (3) dead code in donation/cashout flows that has structural bugs awaiting activation.
