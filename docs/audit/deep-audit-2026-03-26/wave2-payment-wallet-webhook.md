# Wave 2 Seam: Payment → Wallet → Webhook Money Truth Table

## Summary
15 bugs across 11 money flows. 4 P0-CRITICAL, 7 P1-HIGH, 2 P2-MEDIUM, 1 P3-LOW. 4 flows have NO payment collection at all.

## P0-CRITICAL

### B1: Phantom dedup — dedup key set BEFORE handler runs
- **File:** stripe-webhook.controller.ts:77
- **Impact:** Handler failure = event permanently skipped. Coins/tips/orders/premium silently lost.

### B2: Gift send debit OUTSIDE transaction
- **File:** gifts.service.ts:130-133 vs 140-172
- **Impact:** Sender loses coins if $transaction fails — no audit trail, no recovery.

### B3: Cashout never initiates real Stripe payout
- **Files:** gifts.service.ts:267-318, monetization.service.ts:464-519
- **Impact:** Diamonds destroyed, user sees "success", no USD transferred.

### B4: Waqf/Zakat/Charity/Treasury have NO payment collection
- **Files:** commerce.service.ts:598-636, 470-504, 524-578; islamic.service.ts:661-683
- **Impact:** raisedAmount incremented by trusting request body. Anyone can fake donations.

## P1-HIGH

### B5: Tip fallback matches wrong tip under concurrency
### B6: Coin purchase handler not idempotent (replay = double credit)
### B7: Dual tip creation paths — MonetizationService.sendTip creates tip without PI (permanently stuck pending)
### B8: Dual subscription paths — MonetizationService.subscribe creates sub without Stripe (permanently stuck)
### B9: Dual cashout paths — both delete diamonds, neither pays out
### B10: Waqf creates NO WaqfDonation record — zero audit trail
### B11: Charity campaign raisedAmount NEVER updated — donations exist but total stays at 0

## Complete Flow Matrix

| Flow | PI Created? | Mapping | Webhook? | Idempotent? | Atomic? | Reconcilable? |
|------|-------------|---------|----------|-------------|---------|---------------|
| Coin Purchase | YES | None (metadata only) | YES | NO (handler level) | YES | Weak |
| Tip (Payments) | YES | Redis 30d TTL | YES | NO | YES | Moderate |
| Tip (Monetization) | **NO** | None | **NO** | N/A | N/A | **Impossible** |
| Gift Send | NO (virtual) | N/A | N/A | No request-level | **SPLIT** | Weak |
| Marketplace Order | YES | DB (stripePaymentId) | YES | YES | YES | **Strong** |
| Premium Sub | YES | None (metadata) | YES | YES | YES | Moderate |
| Membership (Payments) | YES (Stripe Sub) | Redis 1yr | YES | YES | YES | Moderate |
| Membership (Monetization) | **NO** | None | **NO** | N/A | N/A | **Impossible** |
| Waqf | **NO** | N/A | **NO** | N/A | YES | **Impossible** |
| Zakat | **NO** | N/A | **NO** | N/A | YES | **Impossible** |
| Charity | **NO** | N/A | **NO** | N/A | YES | **Impossible** |
| Treasury | **NO** | N/A | **NO** | N/A | YES | **Impossible** |
| Cashout (either) | **NO payout** | N/A | N/A | N/A | Partial | **Impossible** |

## Best Implementation: Marketplace Order
- DB-based mapping (Order.stripePaymentId)
- PI cancellation on order failure
- Idempotent webhook handler
- No Redis dependency
- Strong reconcilability

## Root Cause
Dual-path confusion: PaymentsService creates Stripe resources correctly, MonetizationService creates DB records without Stripe. Mobile must know which to call — no enforcement. 5 flows (waqf/zakat/charity/treasury/cashout) are architecturally incomplete — no payment infrastructure exists.
