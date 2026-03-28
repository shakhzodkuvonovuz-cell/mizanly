# Wave 1: Wallet Source of Truth Audit

## Summary
9 findings. 4 HIGH, 4 MEDIUM, 1 INFO. Dual balance system resolved but money operations have atomicity gaps.

## HIGH

### F3: Gift send — debit OUTSIDE transaction
- **File:** `gifts.service.ts:130-172`
- **Evidence:** `coinBalance.updateMany` (debit) at line 130 is OUTSIDE the `$transaction` at line 140 that creates gift/credit/log
- **Failure:** If $transaction fails, sender loses coins permanently with no audit trail

### F7: Coin purchase webhook lacks idempotency guard
- **File:** `payments.service.ts:443-475`
- **Evidence:** No `stripePaymentId` check before increment. CoinTransaction model has no stripePaymentId field.
- **Failure:** Duplicate webhook = double credit

### F8: Tip webhook diamond credit lacks idempotency
- **File:** `payments.service.ts:549-597`
- **Evidence:** `tip.update` sets `status: 'completed'` without checking current status first
- **Failure:** Duplicate webhook = double diamond credit

### F9: Cashout never initiates real Stripe payout
- **Files:** `monetization.service.ts:464-519`, `gifts.service.ts:267-318`
- **Evidence:** Both deduct diamonds, create CoinTransaction, but ZERO Stripe API calls
- **Failure:** Diamonds destroyed, no USD transferred. App reports success.

## MEDIUM

### F2: Duplicate cashout endpoints (both reachable from mobile)
### F4: Cashout debit not atomic with transaction log
### F5: No DB CHECK constraint prevents negative balances
### F6: No coin/diamond balance reconciliation exists

## INFO
### F1: Dual balance system resolved — User.coinBalance field removed, CoinBalance table is sole source
