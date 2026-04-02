# YOU ARE TAB 4. YOUR AUDIT FILES ARE T10 + T08. DO NOT SPAWN SUBAGENTS.

# TEST WRITING SESSION — Wave 7 Tab 4: Search/Hashtags/Embeddings/Recommendations/Feed/Promotions + Payments/Monetization/Gifts/Commerce

> ~148 test gaps across 2 audit files. T10 (84 gaps in 88 rows): search, hashtags, embeddings, recommendations, feed, promotions. T08 (64 gaps in 158 rows): payments, monetization, gifts, commerce.
> **YOUR JOB: Read T10.md + T08.md. Write the missing tests. Do NOT modify source code.**

---

## WHAT THIS SESSION IS

TEST WRITING only. Write `.spec.ts` tests that close the gaps described in the audit files.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: EVERY TEST MUST PASS — `pnpm test -- --testPathPattern=<module>` after each batch.
### RULE 2: ASSERT SPECIFIC BEHAVIOR — return values, thrown exceptions, mock call args. No weak stubs.
### RULE 3: MATCH EXISTING PATTERNS — read existing specs first. Use `globalMockProviders`, `PrismaService` mock.
### RULE 4: PRIORITIZE C > H > M.
### RULE 5: ADD TO EXISTING SPEC FILES where they exist.
### RULE 6: CHECKPOINT = TEST + COMMIT per T-file.
### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY. NO SOURCE CODE CHANGES.
### RULE 8: TOTAL ACCOUNTING in `docs/audit/v2/fixes/W7_TAB4_PROGRESS.md`.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read both audit files IN FULL:
   - `docs/audit/v2/wave7/T10.md` (88 rows — search, hashtags, embeddings, recommendations, feed, promotions)
   - `docs/audit/v2/wave7/T08.md` (158 rows — payments, monetization, gifts, commerce)
3. Read existing spec files:
   - `apps/api/src/modules/search/search.service.spec.ts`
   - `apps/api/src/modules/feed/feed.service.spec.ts`
   - `apps/api/src/modules/payments/payments.service.spec.ts`
   - `apps/api/src/modules/monetization/monetization.service.spec.ts`
   - `apps/api/src/modules/commerce/commerce.service.spec.ts`
4. Read `apps/api/src/common/test/mock-providers.ts`

---

## YOUR SCOPE

```
# T10 modules
apps/api/src/modules/search/           # 1,028 source, 1,575 test lines
apps/api/src/modules/hashtags/         # 521 source, 504 test lines
apps/api/src/modules/embeddings/       # 779 source, 1,176 test lines
apps/api/src/modules/recommendations/  # 858 source, 893 test lines
apps/api/src/modules/feed/            # 2,048 source, 1,610 test lines
apps/api/src/modules/promotions/       # 307 source, 234 test lines

# T08 modules
apps/api/src/modules/payments/        # 1,188 source, 629 test lines (0.53:1 ratio!)
apps/api/src/modules/monetization/     # 822 source, 1,075 test lines
apps/api/src/modules/gifts/           # 488 source, 625 test lines
apps/api/src/modules/commerce/         # 1,068 source, 558 test lines (0.52:1 ratio!)
```

**T10 KEY GAPS:**
- Search: `searchPosts` edge cases (empty query, special chars, language-specific)
- Hashtags: `getTrendingHashtags` scoring algorithm branches untested
- Embeddings: `generateEmbedding` retry/fallback logic untested
- Feed: `getPersonalizedFeed` — the core 3-stage scoring algorithm has partial coverage. Diversity injection, Islamic content boosting, and exploration budget untested
- Promotions: `createPromotion` payment validation untested

**T08 KEY GAPS — payments module has lowest test ratio (0.53:1):**
- Payments: `handleCoinPurchaseSucceeded` idempotency guard (alreadyCredited check) untested
- Payments: `handleInvoicePaid` happy path untested
- Payments: Stripe webhook signature verification untested
- Monetization: Payout eligibility checks, minimum payout threshold, payout cooldown
- Commerce: `createOrder` stock validation, `fulfillOrder` shipping status transitions, `refundOrder` Stripe refund flow
- Commerce: Only 0.52:1 test ratio — extensive untested logic

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=search
cd apps/api && pnpm test -- --testPathPattern=hashtags
cd apps/api && pnpm test -- --testPathPattern=embeddings
cd apps/api && pnpm test -- --testPathPattern=recommendations
cd apps/api && pnpm test -- --testPathPattern=feed
cd apps/api && pnpm test -- --testPathPattern=promotions
cd apps/api && pnpm test -- --testPathPattern=payments
cd apps/api && pnpm test -- --testPathPattern=monetization
cd apps/api && pnpm test -- --testPathPattern=gifts
cd apps/api && pnpm test -- --testPathPattern=commerce
cd apps/api && pnpm test   # All tests
```

---

## WORK ORDER

1. **T10** — search/hashtags/embeddings/recommendations/feed/promotions
2. Commit: `test(api): W7-T4 CP1 — T10 search/feed/recommendations [N tests]`
3. **T08** — payments (lowest ratio, most gaps), monetization, gifts, commerce
4. Commit: `test(api): W7-T4 CP2 — T08 payments/monetization/commerce [N tests]`

---

## DELIVERABLES
- **246/246 rows documented** (88 + 158)
- **~110+ new `it()` blocks**
- **All tests pass**
- **2 commits**

**148 test gaps. Payments and commerce have the worst test ratios. Fix those first. Begin.**
