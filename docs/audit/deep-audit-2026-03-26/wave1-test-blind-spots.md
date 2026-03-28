# Wave 1: Test Suite Blind Spots Audit

## Summary
12 findings. 1 CRITICAL, 4 HIGH, 4 MEDIUM, 3 LOW. 5,311 tests create significant false confidence.

## CRITICAL

### F5: ALL tests mock Prisma — zero database integration tests
- **Evidence:** Every spec uses mockPrismaService. CI starts PostgreSQL but no test connects to it.
- **Failure:** Query correctness (WHERE clauses, transaction semantics, cascade deletes) untested against real DB.

## HIGH

### F1: Tests with ZERO assertions (fire-and-forget)
- payments.service.spec.ts:225-228 — calls handler, asserts nothing
- push.service.spec.ts:121-133 — two error tests with zero assertions

### F4: Concurrency tests assert only "did not crash" — not correctness
- 10 spec files use Promise.allSettled then check `status.toBeDefined()` (always true)
- Never verify final counter values, no double-write detection

### F6: Payment webhook tests verify routing, not money math
- $transaction callback mocked to auto-succeed. Coin amounts, user IDs never verified.

### F8: deleteAccount tests don't verify data anonymization
- Only checks `{ deleted: true }` return. Never verifies PII fields cleared.

## MEDIUM

### F3: 379 toBeDefined() assertions — many sole assertions proving nothing
### F7: ContentSafetyService tests always return safe:false (AI path untested)
### F11: Push notification delivery chain mocked at every level (no end-to-end)
### F12: globalMockProviders set AI/content safety to always "safe" — moderation integration untested

## LOW

### F2: 29 "should be defined" boilerplate tests (count padding)
### F9: Missing lifecycle transition tests (ban→hide, schedule→publish, delete→anonymize)
### F10: Stripe webhook signature verification mocked (expected for unit tests)

## Bottom Line
Strong: auth guard (16 tests), follows, messages. Weak: payments, moderation, deletion, all DB queries.
