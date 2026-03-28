# Wave 1: Payment Webhook Idempotency Audit

## Summary
12 findings. 1 CRITICAL, 5 HIGH, 3 MEDIUM, 1 LOW. 2 payment flows have NO payment collection at all.

## CRITICAL

### F1: Dedup key set BEFORE handler execution — handler failure creates phantom dedup
- **File:** `stripe-webhook.controller.ts:77` (setex) then `:81-124` (handlers)
- **Evidence:** Redis dedup key set at line 77, handler called after. If handler throws, Stripe retries but dedup key blocks retry permanently (7-day TTL).
- **Failure:** Silent money loss for ALL payment types on any handler error (DB timeout, network error)
- **Systemic:** All 7 webhook event types

## HIGH

### F2: Coin purchase — no handler-level idempotency
- **File:** `payments.service.ts:443-475`
- **Evidence:** Blind `increment` with no `stripePaymentId` dedup check. CoinTransaction has no stripePaymentId field.
- **Failure:** Redis restart during retry window = double-credit

### F3: Tip fallback matches wrong tip under concurrency
- **File:** `payments.service.ts:549-566`
- **Evidence:** Fallback queries `findFirst({ where: { senderId, status: 'pending' }, orderBy: { createdAt: 'desc' } })` — picks most recent, not the one for this PaymentIntent
- **Failure:** Wrong tip completed, user A's payment credits wrong tip

### F4: Waqf contribution has NO payment collection
- **File:** `commerce.service.ts:598-636`
- **Evidence:** `contributeWaqf` increments `raisedAmount` with no PaymentIntent creation. Free counter increment.
- **Failure:** Fund appears to reach goal without real money

### F5: Charity donations stuck permanently pending
- **File:** `islamic.service.ts:661-683`
- **Evidence:** Creates donation record with status "pending" but no PaymentIntent created, no webhook handler for donation type
- **Failure:** All charity donations remain pending forever

### F6: No Stripe-to-DB payment reconciliation
- **Evidence:** No cron job or task compares Stripe PaymentIntent statuses with local records. No mechanism to detect stuck pending tips/orders/subscriptions.

## MEDIUM

### F7: Dedup relies solely on Redis (no DB layer)
### F8: handleInvoicePaymentFailed has no DB fallback — silently drops
### F9: Dual tip creation paths (payments vs monetization service)

## LOW
### F10: PaymentIntent ID stored in `stripeSubId` field (data quality)

## POSITIVE: Stripe signature verification is correct (constructEvent with rawBody)
