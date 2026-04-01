# FIX SESSION — Tab 4: Payments, Notifications, Islamic

> Paste into a fresh Claude Code session. Fixes 112 findings. PAYMENTS MODULE HANDLES REAL MONEY — every fix must be atomic, every test must prove financial integrity.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Standing Rules and Integrity Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 5 audit finding files IN FULL:
   - `docs/audit/v2/wave1/A09.md` (29 findings — payments, monetization, gifts, commerce)
   - `docs/audit/v2/wave2/B08.md` (23 findings — CoinBalance, CoinTransaction, Gift, Cashout, Donation)
   - `docs/audit/v2/wave1/A08.md` (18 findings — notifications, webhooks)
   - `docs/audit/v2/wave2/B10.md` (20 findings — Notification, PushToken, NotificationSetting)
   - `docs/audit/v2/wave1/A14.md` (22 findings — islamic, mosques, halal, scholar-qa)
4. Create: `docs/audit/v2/fixes/TAB4_PROGRESS.md`
5. Run `mkdir -p docs/audit/v2/fixes` if needed
6. Read this ENTIRE prompt before touching source code

---

## YOUR SCOPE — THESE MODULES ONLY

```
apps/api/src/modules/payments/
apps/api/src/modules/monetization/
apps/api/src/modules/gifts/
apps/api/src/modules/commerce/
apps/api/src/modules/notifications/
apps/api/src/modules/webhooks/
apps/api/src/modules/islamic/
apps/api/src/modules/mosques/
apps/api/src/modules/halal/
apps/api/src/modules/scholar-qa/
```

**FORBIDDEN — DO NOT TOUCH:**
- `schema.prisma` — note cascade/type findings as DEFERRED
- `chat.gateway.ts`
- Any module not listed above
- Tab 1 modules (auth, users, follows, blocks, reports, moderation)
- Tab 2 modules (posts, reels, threads)
- Tab 3 modules (videos, stories, messages)
- `apps/mobile/`, Go services

---

## ENFORCEMENT RULES

### E1: PROVE every fix
Write to `docs/audit/v2/fixes/TAB4_PROGRESS.md`:
```
### Finding A09-#1 (Severity: C)
**Audit says:** payments.service.ts:90 — storePaymentIntentMapping is fire-and-forget (no await)
**Before:** `this.prisma.paymentMapping.upsert({ ... })` — no await, returns void, failure silently lost
**After:** `await this.prisma.paymentMapping.upsert({ ... })` — awaited, failure throws, caller handles error
**Also fixed:** Same pattern at line 105 (storeSubscriptionMapping)
**Test:** payments.service.spec.ts — added "should throw on failed payment mapping" test + "should await mapping before returning"
**Status:** FIXED + TESTED
```

### E2: TEST every fix individually
```bash
cd apps/api && pnpm test -- --testPathPattern=payments     # after each payments fix
cd apps/api && pnpm test -- --testPathPattern=gifts        # after each gifts fix
cd apps/api && pnpm test -- --testPathPattern=monetization # after each monetization fix
cd apps/api && pnpm test -- --testPathPattern=commerce     # after each commerce fix
cd apps/api && pnpm test -- --testPathPattern=notifications # after each notifications fix
cd apps/api && pnpm test -- --testPathPattern=islamic      # after each islamic fix
```
**Minimum new tests: 25.**

### E3: CHECKPOINT every 10 fixes
After every 10th fix:
```
CHECKPOINT [10/112]

1. Run: cd apps/api && pnpm test -- --testPathPattern="payments|gifts|monetization|commerce|notifications|webhooks|islamic|mosques|halal|scholar"
2. Run: cd apps/api && npx tsc --noEmit 2>&1 | tail -20
3. Run: git diff --stat
4. Grep-verify 3 random fixes at cited lines
5. FOR PAYMENT FIXES: re-read the ENTIRE modified function — verify $transaction boundaries are correct, verify all queries inside use `tx` client not `this.prisma`
6. Write checkpoint to progress file
7. COMMIT
```

Checkpoints at: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 112 = 11 checkpoints.

### E4-E10: Same as other tabs
No skipping. Read before fixing. Pattern propagation. No shallow fixes. Commit every checkpoint. Hostile self-review. Final progress file.

---

## ⚠️ PAYMENTS MODULE — MONEY BUGS ARE CRITICAL

Every payment finding is a potential financial loss, double-charge, or exploit. Treat EVERY payment fix as Critical regardless of the audit's severity rating.

### RULE: Every payment operation must be in $transaction
If you find ANY multi-step payment operation not wrapped in `$transaction`, fix it:

```typescript
// WRONG — partial failure leaves inconsistent state
await this.prisma.coinBalance.update({ ... });  // debit coins
await this.prisma.coinTransaction.create({ ... }); // record transaction
await this.prisma.gift.create({ ... }); // create gift record

// RIGHT — all succeed or all fail
await this.prisma.$transaction(async (tx) => {
  await tx.coinBalance.update({ ... });      // use tx, not this.prisma
  await tx.coinTransaction.create({ ... });  // use tx
  await tx.gift.create({ ... });             // use tx
});
```

**CRITICAL: Inside $transaction, use `tx.model.method()`, NOT `this.prisma.model.method()`.** Using `this.prisma` inside a transaction runs OUTSIDE the transaction — the most common mistake that makes the $transaction useless.

### KNOWN CRITICAL FINDINGS (expect these in your audit files):

1. **Fire-and-forget payment mapping** (A09)
   - `storePaymentIntentMapping` called without `await`
   - Impact: tip money collected but receiver never credited
   - Fix: add `await`. Add error handling (what happens if upsert fails AFTER payment collected?)

2. **Cashout not atomic** (A09/B08)
   - Cashout debit + payout record + transfer are separate queries
   - Impact: race condition → double cashout
   - Fix: wrap in $transaction with pessimistic locking (`FOR UPDATE` or advisory lock)

3. **Rose gift = 0 diamonds** (B08)
   - Diamond calculation: `Math.floor(coins * 0.55)` for 1 coin = 0
   - Impact: sender pays 1 coin, receiver gets nothing
   - Fix: `Math.max(1, Math.floor(coins * 0.55))` — minimum 1 diamond per gift

4. **boostPost collects no payment** (A09)
   - Accepts budget parameter but never charges
   - Impact: free promotion for everyone
   - Fix: wire payment BEFORE applying boost. If no payment integration yet, make the endpoint return 501 Not Implemented (better than silently giving free boosts)

5. **CoinBalance onDelete: Cascade** (B08)
   - Schema finding — DEFER, but understand the impact: user deletion destroys financial records. Note in progress file.

### PAYMENT FIX VERIFICATION — EXTRA STEP
After each payment fix, mentally trace the ENTIRE money flow:
```
Does money come in correctly? (payment → coins credited)
Does money move correctly? (coins → gift → diamonds)
Does money go out correctly? (diamonds → cashout → bank)
Can any step fail silently? (no fire-and-forget)
Can any step be exploited? (no double-spend, no negative balance)
Is every multi-step operation atomic? ($transaction)
```

If you can't answer YES to all 6, your fix is incomplete.

---

## NOTIFICATIONS MODULE — RELIABILITY

Notification findings are about reliability and user preference respect:

1. **NotificationSetting enforcement** — if the audit says settings are placebo (stored but not checked before delivery), fix: add a check BEFORE creating the notification/push
2. **Webhook HMAC verification** — if webhook handlers don't verify signatures, add HMAC-SHA256 verification using the webhook secret
3. **Notification dedup** — if Redis dedup is broken, fix the key pattern and TTL
4. **Push delivery** — if push notification fails silently, add error logging to Sentry (NOT the message content — just "push delivery failed for userId X")
5. **Batch optimization** — the audit may note that notifications fire 4 queries per recipient. If this is in your audit files, refactor to batch: pre-fetch all settings, filter, then batch-create notifications

### NOTIFICATION FIX PATTERN
```typescript
// WRONG — creates notification without checking settings
await this.prisma.notification.create({ data: { userId, type, ... } });

// RIGHT — check settings first
const settings = await this.prisma.notificationSetting.findUnique({ where: { userId } });
if (settings && settings[type] === false) return; // user disabled this type
await this.prisma.notification.create({ data: { userId, type, ... } });
```

---

## ISLAMIC MODULE — RESPECT THE CONTENT

### RULES FOR ISLAMIC FIXES:
1. **DO NOT generate, modify, or invent Islamic content.** No AI-generated hadiths, duas, Quran references, or fatwa answers.
2. **Code fixes only.** Validation, error handling, rate limiting, DTO validation, visibility filters — these are fine.
3. **If a finding is about Islamic data accuracy** (wrong hadith grading, incorrect Quran reference), mark it as: "DEFERRED — requires user review. Islamic data must be manually verified by the founder."
4. **If a finding is about a dead code path** (e.g., `createDonation` has unreachable code after throw), you CAN delete the dead code. But DO NOT change the business logic.
5. **Scholar verification, fatwa answers, Islamic calendar** — if these have code bugs, fix the code. If they have content bugs, defer.
6. **mosque finder, halal finder** — if these have API integration issues, fix the code. If they need data sources, defer.

---

## FIX ORDER (highest risk first)

1. **payments/** (A09 payment findings) — MONEY. Fix first. 15-20 minutes per finding.
2. **gifts/** (A09 gift findings + B08) — MONEY. Cashout atomicity, diamond calc.
3. **monetization/ + commerce/** (remaining A09 + B08) — MONEY. Order management.
4. **notifications/ + webhooks/** (A08 + B10) — RELIABILITY. Settings enforcement, webhook security.
5. **islamic/ + mosques/ + halal/ + scholar-qa/** (A14) — ISLAMIC. Code fixes only, no content changes.

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=payments
cd apps/api && pnpm test -- --testPathPattern=gifts
cd apps/api && pnpm test -- --testPathPattern=monetization
cd apps/api && pnpm test -- --testPathPattern=commerce
cd apps/api && pnpm test -- --testPathPattern=notifications
cd apps/api && pnpm test -- --testPathPattern=webhooks
cd apps/api && pnpm test -- --testPathPattern=islamic
cd apps/api && pnpm test -- --testPathPattern=mosques
cd apps/api && pnpm test -- --testPathPattern=halal
cd apps/api && pnpm test -- --testPathPattern=scholar
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## THE STANDARD

112 findings. Money module first. Every payment fix traced through the full flow. Every notification fix respects user settings. Islamic content never AI-generated.

112 findings. 112 documented outcomes. 25+ new tests. 11 checkpoints. 11 commits. 1 progress file with before/after diffs for every finding.

The payments module is where trust is built or destroyed. A single double-charge bug at launch = 1-star reviews, refund requests, and "this app steals money" Reddit posts. Fix it like your reputation depends on it — because it does.

**112 findings. Zero shortcuts. Begin.**
