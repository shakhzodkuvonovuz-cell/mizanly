# Post-Fix Deep Audit: Tier 1 (10 Fixes)

## 1 Critical, 9 Important, 6 Suggestions

### CRITICAL

**C1: Webhook double-processing if Redis fails after handler success**
- File: `stripe-webhook.controller.ts:128`
- If handler succeeds (coins credited) but `redis.setex` throws (Redis down), error propagates → Stripe gets 500 → retries → handler runs again → double credit
- **FIX NEEDED:** Wrap setex in try/catch, log CRITICAL but don't re-throw

### IMPORTANT

**I1: Following feed + blended feed following portion MISSING isBanned filter**
- posts.service.ts:249-253 (following feed) — has `userId: { in: visibleUserIds }` but NO user relation filter
- posts.service.ts:324-330 (blended following half) — same gap
- **FIX NEEDED:** Add `user: { isBanned: false, isDeactivated: false }`

**I2: sendTip not disabled (creates unverifiable records without payment)**
- monetization.service.ts:46-87 — creates Tip with status 'pending', no Stripe PI
- **FIX NEEDED:** Add throw like other 4 donation methods

**I3: reactivateAccount leaves dangling scheduledDeletionAt**
- users.service.ts:1085 — clears isDeactivated but NOT scheduledDeletionAt
- If user later deactivates again, stale scheduledDeletionAt could trigger unexpected deletion

**I4: Auto-unban overwrites user's self-deactivation**
- If user self-deactivated BEFORE being temp-banned, auto-unban clears their self-deactivation
- No deactivationReason field to distinguish admin ban from user choice
- Same issue in admin.service.ts unbanUser

**I5: ForYou/Trending pool instability across pages**
- 200-row pool re-fetched on every page. Pool changes between pages → duplicates/gaps
- ForYou has 60s cache which helps. Trending has NO cache (inconsistency).
- Acceptable for MVP but not production-grade.

### VERIFIED CORRECT
- Fix 1.4 (gift atomicity): All 6 ops in one tx, gte guard, concurrent safety ✓
- Fix 1.9 (disable cashout): Both methods throw first line, no bypass ✓
- Fix 1.10 (disable donations): 4/4 methods throw first line ✓ (sendTip missed)
