# Agent #17: Error Handling Patterns — Deep Audit

**Scope:** All backend error handling across `apps/api/src/modules/**/*.service.ts`, `apps/api/src/common/filters/`, `apps/api/src/common/interceptors/`
**Files audited:** 87 service files, 1 exception filter, 1 transform interceptor
**Total findings: 53**

---

## TIER 0 — Ship Blockers (11 findings)

### Finding 17-01: Coins credited before payment verification (CRITICAL)
- **File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 130-134
- **Severity:** CRITICAL / Financial Loss
- **Category:** Fail-open on payment
- **Description:** `purchaseCoins()` increments the user's `coinBalance` immediately after creating a Stripe PaymentIntent, BEFORE the payment has actually succeeded. The comment even acknowledges this: `// Credit coins (in production, do this in the webhook after payment succeeds)`. An attacker can call this endpoint, receive coins, then cancel/decline the payment.
- **Code:**
```typescript
// Credit coins (in production, do this in the webhook after payment succeeds)
await this.prisma.user.update({
  where: { id: userId },
  data: { coinBalance: { increment: pkg.coins } },
});
```
- **Fix:** Move coin crediting to the `payment_intent.succeeded` webhook handler. Return a pending status from this endpoint.

### Finding 17-02: Diamonds deducted before Stripe transfer verified (CRITICAL)
- **File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 200-222
- **Severity:** CRITICAL / Financial Loss
- **Category:** Non-atomic financial operation
- **Description:** `cashout()` deducts diamonds from the user's balance FIRST (line 201), then attempts the Stripe transfer (line 207-221). If the Stripe transfer fails (network error, insufficient platform balance, invalid account), the diamonds are already gone — the user loses money with no recourse. The Stripe `fetch` response is not even checked for success.
- **Code:**
```typescript
// Deduct diamonds
await this.prisma.user.update({
  where: { id: userId },
  data: { diamondBalance: { decrement: diamondAmount } },
});

// Create Stripe transfer + payout
if (this.apiAvailable && user.stripeConnectAccountId) {
  await fetch('https://api.stripe.com/v1/transfers', { ... });
  // NO response check! Transfer could fail silently.
}
```
- **Fix:** Wrap in a transaction. Check Stripe transfer response. Rollback diamond deduction on failure.

### Finding 17-03: Stripe Connect account creation — no response error check
- **File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 44-84
- **Severity:** CRITICAL
- **Category:** Missing error handling on external API
- **Description:** `createConnectedAccount()` calls `fetch` to Stripe `/v1/accounts` and `/v1/account_links` but never checks `response.ok`. If the account creation fails, `account.id` will be undefined, and the code stores `undefined` as the user's `stripeConnectAccountId` in the database. The onboarding link response is also not checked — `link.url` could be undefined.
- **Code:**
```typescript
const response = await fetch('https://api.stripe.com/v1/accounts', { ... });
const account = await response.json(); // No response.ok check
const accountId = account.id; // Could be undefined on error
await this.prisma.user.update({ data: { stripeConnectAccountId: accountId } }); // Saves undefined
```
- **Fix:** Check `response.ok` after both fetch calls. Throw on failure before saving to DB.

### Finding 17-04: ALL content moderation fails open — unsafe content allowed on API error
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, lines 35-70 and 83-106
- **Severity:** CRITICAL / Safety
- **Category:** Fail-open moderation
- **Description:** Both `moderateImage()` and `moderateText()` return `{ safe: true }` in ALL error cases:
  1. When `ANTHROPIC_API_KEY` is not set (line 36, 83)
  2. When the API returns a non-200 response (line 64, 101)
  3. When any exception occurs (line 68-69, 104-105)

  This means ALL content is allowed through when the AI service is unavailable, misconfigured, rate-limited, or experiencing errors. A platform serving the Muslim community cannot allow NSFW/hate content through on API hiccups.
- **Fix:** Return `{ safe: false, action: 'queue_manual_review' }` on error. Block or queue content for manual review instead of auto-approving.

### Finding 17-05: AI moderation service (`ai.service.ts`) also fails open
- **File:** `apps/api/src/modules/ai/ai.service.ts`, lines 70-80, 234-238, 477-479, 518-520, 538-541
- **Severity:** CRITICAL / Safety
- **Category:** Fail-open moderation
- **Description:** `moderateContent()` returns `{ safe: true, flags: [], confidence: 0.5 }` on JSON parse failure (line 237). `moderateImage()` returns `classification: 'SAFE'` on ALL error paths:
  - API unavailable (line 478-479): "defaulting to manual review" but returns SAFE
  - HTTP error (line 519-520): returns SAFE
  - Exception (line 539-541): returns SAFE

  The `callClaude()` method also returns fallback responses for moderation that include `safe: true` (line 88).
- **Fix:** Moderation functions should never return "safe" on error. Return an uncertain/pending state and queue for human review.

### Finding 17-06: Monetization tips created as 'completed' without payment
- **File:** `apps/api/src/modules/monetization/monetization.service.ts`, lines 39-57
- **Severity:** CRITICAL / Financial
- **Category:** No payment verification
- **Description:** `sendTip()` creates a Tip record with `status: 'completed'` immediately, without ANY payment processing. No Stripe charge, no balance deduction, no payment method — just a direct DB write. This is free money.
- **Code:**
```typescript
const tip = await this.prisma.tip.create({
  data: {
    senderId, receiverId, amount, currency: 'USD',
    message, platformFee,
    status: 'completed', // Immediately completed with zero payment
  },
});
```
- **Fix:** Integrate with Stripe PaymentIntents. Set status to 'pending' until payment webhook confirms success.

### Finding 17-07: Commerce premium subscription has no payment integration
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 319-331
- **Severity:** HIGH / Financial
- **Category:** No payment verification
- **Description:** `subscribePremium()` activates a premium subscription immediately without any payment. Any user can become premium for free.
- **Fix:** Integrate with Stripe. Only activate subscription after successful payment.

### Finding 17-08: Orders created without payment verification
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 82-123
- **Severity:** HIGH / Financial
- **Category:** No payment verification
- **Description:** `createOrder()` creates an order and decrements product stock atomically, but the order starts as 'pending' — there is no payment step. The order exists and stock is decremented with no money changing hands. While status transitions exist, nothing prevents items from being "shipped" without payment.
- **Fix:** Integrate payment into the order flow. Only decrement stock after payment confirmation.

### Finding 17-09: Zakat donations recorded without actual money transfer
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 255-281
- **Severity:** HIGH / Financial
- **Category:** No payment verification
- **Description:** `donateZakat()` creates a ZakatDonation record and increments the fund's `raisedAmount` without any payment processing. Users can inflate donation amounts to any value up to 1,000,000 without spending money.
- **Fix:** Integrate with payment provider. Only record donation after payment succeeds.

### Finding 17-10: Treasury contributions recorded without payment
- **File:** `apps/api/src/modules/commerce/commerce.service.ts`, lines 293-310
- **Severity:** HIGH / Financial
- **Category:** No payment verification
- **Description:** Same issue as Zakat — `contributeTreasury()` records contributions up to 1,000,000 with zero payment processing.

### Finding 17-11: Gift system's `purchaseCoins()` in gifts.service.ts has no payment
- **File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 63-87
- **Severity:** CRITICAL / Financial
- **Category:** No payment verification
- **Description:** `purchaseCoins()` takes any positive integer `amount` and directly increments the user's coin balance with ZERO payment processing. Any user can call this to get unlimited free coins.
- **Code:**
```typescript
async purchaseCoins(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestException('Amount must be a positive integer');
  }
  const balance = await this.prisma.coinBalance.upsert({
    where: { userId },
    update: { coins: { increment: amount } }, // Free coins!
    create: { userId, coins: amount, diamonds: 0 },
  });
```

---

## TIER 1 — Security/Safety (12 findings)

### Finding 17-12: SQL injection in embeddings via string interpolation
- **File:** `apps/api/src/modules/embeddings/embeddings.service.ts`, lines 255-257, 289-294
- **Severity:** CRITICAL / Security
- **Category:** SQL Injection
- **Description:** `findSimilar()` builds SQL using string interpolation with user-controlled `filterTypes` and `excludeIds`:
```typescript
const typeFilter = filterTypes?.length
  ? `AND e2."contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`
  : '';
```
And in `findSimilarByVector()`:
```typescript
conditions.push(`"contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`);
conditions.push(`"contentId" NOT IN (${excludeIds.map(id => `'${id}'`).join(',')})`);
```
These values are wrapped in single quotes but not escaped. A `filterTypes` value of `'); DROP TABLE embeddings; --` would execute arbitrary SQL.
- **Fix:** Use parameterized queries or Prisma's tagged template literals.

### Finding 17-13: Content moderation results parsed from LLM response via JSON.parse without validation
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, line 67
- **Severity:** HIGH
- **Category:** Prompt injection / trust boundary
- **Description:** The AI moderation response is `JSON.parse(text)` where `text` is the raw LLM output. If an attacker crafts content that tricks the LLM into producing a response like `{"safe": true, "flags": []}`, the moderation is bypassed. There's no schema validation of the parsed result.
- **Fix:** Validate the parsed JSON against a strict schema. Never trust LLM output as authoritative for safety decisions.

### Finding 17-14: SSRF via unvalidated imageUrl in moderation
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, line 40
- **File:** `apps/api/src/modules/ai/ai.service.ts`, lines 483-499, 563-577
- **Severity:** HIGH / Security
- **Category:** SSRF
- **Description:** `moderateImage()`, `moderateImage()` in ai.service, and `generateAltText()` pass user-supplied `imageUrl` directly to the Claude Vision API without validating that it's a public URL. An attacker could supply `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint) or internal network URLs.
- **Fix:** Validate that URLs match the expected R2/CDN domain pattern. Block internal/private IP ranges.

### Finding 17-15: SSRF via unvalidated audioUrl in Whisper transcription
- **File:** `apps/api/src/modules/ai/ai.service.ts`, lines 337, 390
- **Severity:** HIGH / Security
- **Category:** SSRF
- **Description:** `generateVideoCaptions()` and `transcribeVoiceMessage()` fetch arbitrary URLs (`audioUrl`) from the server. No URL validation.
- **Fix:** Validate URLs against allowed domains.

### Finding 17-16: Webhook delivery URL not validated (SSRF)
- **File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, lines 13, 54-69
- **Severity:** HIGH / Security
- **Category:** SSRF
- **Description:** Webhook `url` and `deliver()` target are user-supplied. The server makes HTTP POST requests to any URL, enabling SSRF attacks against internal services.
- **Fix:** Validate webhook URLs against allowed schemes (https only), block private IP ranges, use a DNS resolution check.

### Finding 17-17: Payment cancel continues on Stripe failure — inconsistent state
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 296-305
- **Severity:** HIGH
- **Category:** Inconsistent state on error
- **Description:** `cancelSubscription()` catches Stripe cancellation errors and continues with local cancellation. This means the subscription is marked 'cancelled' locally but may still be active on Stripe, leading to continued billing.
- **Code:**
```typescript
try {
  await this.stripe.subscriptions.cancel(stripeSubscriptionId);
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  this.logger.error(`Stripe subscription cancel failed: ${msg}`);
  // Continue with local cancellation even if Stripe fails
}
```
- **Fix:** If Stripe cancel fails, mark as 'cancel_pending' and retry. Don't complete local cancellation until Stripe confirms.

### Finding 17-18: `attachPaymentMethod` has no try/catch — raw Stripe error leaks
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 345-349
- **Severity:** MEDIUM / Information Disclosure
- **Category:** Missing error handling
- **Description:** `attachPaymentMethod()` calls `this.stripe.paymentMethods.attach()` with no try/catch. If Stripe throws (invalid card, rate limit), the raw Stripe error propagates to the client, potentially leaking Stripe internal details.
- **Code:**
```typescript
async attachPaymentMethod(userId: string, paymentMethodId: string) {
  const customerId = await this.getOrCreateStripeCustomer(userId);
  await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  return { success: true };
}
```
- **Fix:** Wrap in try/catch, return user-friendly error.

### Finding 17-19: `listPaymentMethods` returns empty array on Stripe failure — silent data loss
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 338-342
- **Severity:** MEDIUM
- **Category:** Silent error swallowing
- **Description:** When Stripe `paymentMethods.list` fails, the method returns `[]` instead of throwing. The user sees "no payment methods" when they may have active cards, potentially leading them to re-add payment methods.
- **Fix:** Distinguish between "no payment methods" and "failed to fetch" in the response.

### Finding 17-20: Dev mode exception filter leaks stack traces
- **File:** `apps/api/src/common/filters/http-exception.filter.ts`, lines 53, 80
- **Severity:** MEDIUM / Information Disclosure
- **Category:** Error information leakage
- **Description:** In non-production mode, the filter includes `stack: exception.stack` in responses. If `NODE_ENV` is not explicitly set to `'production'` on the deployed server, stack traces leak to clients, exposing file paths, module structure, and dependency versions.
- **Fix:** Ensure `NODE_ENV=production` is set in all deployed environments. Consider removing stack traces from API responses entirely.

### Finding 17-21: Stripe constructor accepts empty string key — deferred failures
- **File:** `apps/api/src/modules/payments/payments.service.ts`, line 27
- **Severity:** LOW
- **Category:** Deferred error
- **Description:** `this.stripe = new Stripe(secretKey || '', ...)` initializes Stripe with an empty string if the key is missing. This doesn't fail at startup — it fails on the first API call with a confusing "Invalid API Key" error.
- **Fix:** Throw during module initialization if `STRIPE_SECRET_KEY` is not set, or flag the service as unavailable.

### Finding 17-22: Push service error handler uses `error.message` without null check
- **File:** `apps/api/src/modules/notifications/push.service.ts`, lines 101, 134
- **Severity:** LOW
- **Category:** Potential crash
- **Description:** `error.message` is accessed without type narrowing. If `error` is not an Error instance (e.g., a string or null), this will throw a secondary error during error handling.
- **Code:**
```typescript
} catch (error) {
  this.logger.error(`Failed to send push batch: ${error.message}`, error.stack);
}
```
- **Fix:** Use `error instanceof Error ? error.message : String(error)`.

### Finding 17-23: Duplicate `getAudienceDemographics` methods in creator.service.ts
- **File:** `apps/api/src/modules/creator/creator.service.ts`, lines 130 and 255
- **Severity:** LOW
- **Category:** Code quality / potential confusion
- **Description:** Two methods named `getAudienceDemographics` exist with different signatures (one takes `userId`, the other `channelId`). TypeScript will use the last one, shadowing the first. This could lead to the wrong method being called.

---

## TIER 2 — Data Integrity (12 findings)

### Finding 17-24: Dual balance systems — coins/diamonds tracked in two places
- **File:** `apps/api/src/modules/gifts/gifts.service.ts` (uses `CoinBalance` model) vs `apps/api/src/modules/monetization/stripe-connect.service.ts` (uses `User.coinBalance` / `User.diamondBalance`)
- **Severity:** CRITICAL / Data Integrity
- **Category:** Dual balance systems
- **Description:** The gift system tracks coins/diamonds in a separate `CoinBalance` table (via `prisma.coinBalance`), while Stripe Connect tracks them on the `User` model (`user.coinBalance`, `user.diamondBalance`). These two systems don't synchronize. A user could have 500 coins in `CoinBalance` and 0 in `User.coinBalance`, or vice versa. Cashout only checks one system.

### Finding 17-25: Subscription status set to 'active' before Stripe confirms payment
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 234-253
- **Severity:** HIGH
- **Category:** Premature state change
- **Description:** `createSubscription()` creates or updates the local `membershipSubscription` with `status: 'active'` immediately, before the subscription's initial payment has been confirmed. The `clientSecret` is returned for client-side payment, but the subscription is already active.
- **Fix:** Set initial status to 'pending'. Update to 'active' only in the `invoice.paid` webhook handler.

### Finding 17-26: Gift `sendGift` — race condition between balance check and deduction
- **File:** `apps/api/src/modules/gifts/gifts.service.ts`, lines 112-163
- **Severity:** MEDIUM
- **Category:** Race condition
- **Description:** The balance check (line 112-117) happens outside the `$transaction`. Between the check and the transaction execution, another concurrent request could also pass the check. The `$transaction` uses batched queries (not interactive), so the decrement could result in a negative balance.
- **Fix:** Use `updateMany` with `{ coins: { gte: catalogItem.coins } }` condition inside the transaction, similar to how `cashout()` correctly does it.

### Finding 17-27: Gamification `unfollowSeries` can go negative
- **File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 456-465
- **Severity:** MEDIUM
- **Category:** Counter going negative
- **Description:** `unfollowSeries()` decrements `followersCount` without clamping. If the count is already 0 (from data inconsistency), it goes negative. The delete could also fail if the user isn't following, which would throw but the decrement would have already happened in the same transaction (since Prisma batched transactions are all-or-nothing, this is actually safe for the transaction but not for the initial state).
- **Fix:** Use `GREATEST(followersCount - 1, 0)` via raw SQL or add a conditional check.

### Finding 17-28: Content-safety `autoRemoveContent` doesn't handle 'comment' type
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, lines 181-196
- **Severity:** MEDIUM
- **Category:** Incomplete implementation
- **Description:** `autoRemoveContent()` accepts `contentType: 'post' | 'reel' | 'thread' | 'comment'` but has no handling for 'comment'. Comments flagged for auto-removal are silently ignored. The moderation log is still created, giving a false impression of action taken.

### Finding 17-29: ModerationLog.create in content-safety uses non-existent fields
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, lines 199-208
- **Severity:** HIGH / Runtime crash
- **Category:** Schema mismatch
- **Description:** `autoRemoveContent()` creates a `moderationLog` with fields `contentId`, `contentType`, `flags`, `status` which may not exist on the ModerationLog Prisma model (the moderation.service.ts version uses `moderatorId`, `action`, `targetUserId`, `targetPostId`, `reason`, `explanation`). This will cause a Prisma validation error at runtime.

### Finding 17-30: Reports.service silently swallows moderation queue failures
- **File:** `apps/api/src/modules/reports/reports.service.ts`, line 88
- **Severity:** MEDIUM
- **Category:** Silent error swallowing
- **Description:** `.catch(() => {})` — completely empty catch that discards all errors from the moderation job queue. If moderation queueing fails, no one knows.
- **Fix:** At minimum log the error: `.catch(err => this.logger.error('Moderation queue failed', err))`.

### Finding 17-31: Reels.service silently swallows search indexing and moderation failures
- **File:** `apps/api/src/modules/reels/reels.service.ts`, lines 161, 177
- **Severity:** MEDIUM
- **Category:** Silent error swallowing
- **Description:** Two `.catch(() => {})` calls completely discard errors from moderation job queueing and search indexing.

### Finding 17-32: Webhook `test()` doesn't verify user owns the webhook's community
- **File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, lines 42-48
- **Severity:** MEDIUM
- **Category:** Authorization gap
- **Description:** `test()` checks that `webhook.createdById === userId` implicitly (via findUnique), but `delete()` does the check while `test()` only checks if webhook exists. Actually, looking more carefully, `test()` doesn't verify authorization at all — any authenticated user can trigger test deliveries for any webhook if they know the ID.

### Finding 17-33: Meilisearch operations silently swallow ALL errors
- **File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 111-113, 141-143, 156-158, 171-173
- **Severity:** MEDIUM
- **Category:** Silent error swallowing
- **Description:** Four `catch { }` blocks swallow errors completely with no logging for `search()`, `deleteDocument()`, `createIndex()`, and `updateSettings()`. Search failures are invisible — the search endpoint returns null and the caller falls back to Prisma, but operational errors are never surfaced.
- **Fix:** Add `this.logger.error()` in each catch block.

### Finding 17-34: Admin `resolveReport` with REMOVE_CONTENT doesn't actually remove content
- **File:** `apps/api/src/modules/admin/admin.service.ts`, lines 95-120 (visible portion)
- **Severity:** HIGH
- **Category:** Incomplete implementation
- **Description:** The admin service's `resolveReport()` sets `actionTaken: 'CONTENT_REMOVED'` on the report but never actually removes/hides the reported content (no `post.update({ isRemoved: true })` etc.). The moderation.service.ts version correctly does this in a transaction, but the admin service version does not.

### Finding 17-35: Privacy export caps at 50 records per content type (GDPR violation)
- **File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 18-32
- **Severity:** HIGH / Legal
- **Category:** Incomplete data export
- **Description:** `exportUserData()` uses `take: 50` for posts, threads, stories, and follows. A user with 1000 posts gets only 50 in their export. GDPR Article 20 (right to data portability) requires ALL user data. Messages are capped at `take: 10000` which is better but still has a cap.

---

## TIER 3 — Error Handling Quality (18 findings)

### Finding 17-36: Stripe Connect uses raw fetch instead of Stripe SDK
- **File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, entire file
- **Severity:** MEDIUM
- **Category:** Fragile error handling
- **Description:** The entire Stripe Connect service uses raw `fetch()` calls to `api.stripe.com` instead of the Stripe Node.js SDK that payments.service.ts already uses. Raw fetch loses automatic retries, type-safe responses, proper error typing, and idempotency key support. Multiple fetch responses go unchecked.

### Finding 17-37: Content-safety `moderateImage` trusts raw JSON.parse of LLM output
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, line 67
- **Severity:** MEDIUM
- **Category:** Unsafe parse
- **Description:** `JSON.parse(text)` on the raw Claude API response text. If the LLM returns malformed JSON or extra text, this throws and falls through to the catch block which returns `safe: true`. No schema validation of the parsed object.

### Finding 17-38: AI service `moderateContent` trusts raw JSON.parse
- **File:** `apps/api/src/modules/ai/ai.service.ts`, line 235
- **Severity:** MEDIUM
- **Category:** Unsafe parse
- **Description:** Same issue — `JSON.parse(result)` on Claude output. Falls back to `{ safe: true }` on parse error. An attacker's content that confuses the LLM into producing invalid JSON gets auto-approved.

### Finding 17-39: No timeout on external API calls
- **File:** Multiple services (ai.service.ts, content-safety.service.ts, embeddings.service.ts, meilisearch.service.ts)
- **Severity:** MEDIUM
- **Category:** Missing timeout
- **Description:** `fetch()` calls to Claude API, Gemini API, Meilisearch, and OpenAI Whisper have no timeout/AbortSignal (except webhooks.service.ts which correctly uses `AbortSignal.timeout(10000)`). If an external API hangs, the request thread blocks indefinitely.
- **Fix:** Add `signal: AbortSignal.timeout(30000)` to all external fetch calls.

### Finding 17-40: Stream service uploadFromUrl has no try/catch
- **File:** `apps/api/src/modules/stream/stream.service.ts`, lines 55-77
- **Severity:** MEDIUM
- **Category:** Missing error handling
- **Description:** `uploadFromUrl()` calls `fetch` to Cloudflare Stream API but if `fetch` itself throws (network error, DNS failure), it propagates as an unhandled error rather than a friendly `InternalServerErrorException`. The `response.ok` check only handles HTTP errors, not network errors.

### Finding 17-41: `handleInvoicePaid` fetches subscription without error handling
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 377-396
- **Severity:** MEDIUM
- **Category:** Missing error handling in webhook
- **Description:** `handleInvoicePaid()` calls `this.stripe.subscriptions.retrieve(subscriptionId)` with no try/catch. If this fails (e.g., subscription deleted), the webhook handler crashes and Stripe retries, potentially creating a retry loop.

### Finding 17-42: Redis mapping expiry creates time bomb for long subscriptions
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 76, 83-84
- **Severity:** MEDIUM
- **Category:** Data loss on expiry
- **Description:** The `subscription:` and `payment_intent:` Redis mappings have 30-day and 7-day TTLs respectively. If a subscription lasts longer than 30 days (which all monthly subscriptions do by definition), the Redis mapping expires. When the next `invoice.paid` webhook arrives, `dbSubscriptionId` will be null, and the subscription end date won't be extended.
- **Fix:** Store the Stripe-to-internal mapping in the database, not Redis. Or use a much longer TTL.

### Finding 17-43: Webhook handlers return silently on missing mapping
- **File:** `apps/api/src/modules/payments/payments.service.ts`, lines 354-358, 381-385, 400-403
- **Severity:** MEDIUM
- **Category:** Silent failure
- **Description:** All three webhook handlers (`handlePaymentIntentSucceeded`, `handleInvoicePaid`, `handleSubscriptionDeleted`) log a warning and return silently if the Redis mapping is missing. Payment/subscription events are permanently lost with no retry mechanism.

### Finding 17-44: Auth service `register` doesn't handle Clerk API failure
- **File:** `apps/api/src/modules/auth/auth.service.ts`, line 30
- **Severity:** MEDIUM
- **Category:** Missing error handling
- **Description:** `this.clerk.users.getUser(clerkId)` is called without try/catch. If Clerk is down or the clerkId is invalid, the raw error propagates. No fallback or user-friendly error.

### Finding 17-45: Two-factor `validate` accepts any code when 2FA is not enabled
- **File:** `apps/api/src/modules/two-factor/two-factor.service.ts`, lines 181-191
- **Severity:** MEDIUM / Security
- **Category:** Logic error
- **Description:** `validate()` returns `true` when 2FA is not enabled. This is by design (if no 2FA, no code required), but the method is named `validate` which implies it's actually checking something. If a caller uses this to verify a code for a sensitive operation, the bypass is dangerous.

### Finding 17-46: Gamification uses non-atomic level update
- **File:** `apps/api/src/modules/gamification/gamification.service.ts`, lines 131-146
- **Severity:** LOW
- **Category:** Race condition
- **Description:** `awardXP()` does upsert with `{ increment: amount }` (atomic), then reads the result and conditionally updates the level in a SEPARATE query. Between the upsert and the level update, another concurrent `awardXP` could execute and also try to set the level, leading to a lost update.

### Finding 17-47: Islamic service Redis cache misses silently swallowed (correct but excessive)
- **File:** `apps/api/src/modules/islamic/islamic.service.ts`, ~12 instances
- **Severity:** INFO
- **Category:** Acceptable pattern but worth noting
- **Description:** The Islamic service has ~12 `catch { }` blocks for Redis cache operations. These are all non-critical (cache miss/write failure), and the service correctly falls through to database/API calls. However, none of them log even at debug level, making it impossible to detect if Redis is consistently failing.

### Finding 17-48: Transform interceptor doesn't handle non-object responses
- **File:** `apps/api/src/common/interceptors/transform.interceptor.ts`, lines 24-36
- **Severity:** LOW
- **Category:** Edge case
- **Description:** If a controller returns `null`, `undefined`, a string, or a number, the interceptor wraps it in `{ success: true, data: null/undefined/string/number }`. This is technically correct but `null` data could confuse clients expecting an object.

### Finding 17-49: Exception filter doesn't handle WebSocket context
- **File:** `apps/api/src/common/filters/http-exception.filter.ts`, line 17
- **Severity:** LOW
- **Category:** Incomplete coverage
- **Description:** `host.switchToHttp()` is called unconditionally. For WebSocket exceptions, this would fail. The gateway's exceptions need a separate WsExceptionFilter or the filter should check `host.getType()` first.

### Finding 17-50: Missing error handling in feed Redis cache parse
- **File:** `apps/api/src/modules/posts/posts.service.ts`, line 94
- **Severity:** LOW
- **Category:** Potential crash
- **Description:** `JSON.parse(cached)` is called without try/catch on the Redis cached feed. If the cached value is corrupted or truncated, this throws an unhandled error.
- **Fix:** Wrap in try/catch, delete corrupted cache key, and fall through to DB query.

### Finding 17-51: Hashtags service counter decrement swallowed silently
- **File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, line 315
- **Severity:** LOW
- **Category:** Silent error
- **Description:** `.catch(() => {})` on hashtag counter decrement. While the comment explains the rationale, a missing hashtag is a data integrity issue that should at least be logged.

### Finding 17-52: `deleteFile` in upload.service has no error handling
- **File:** `apps/api/src/modules/upload/upload.service.ts`, lines 112-116
- **Severity:** LOW
- **Category:** Missing error handling
- **Description:** `deleteFile()` calls `this.s3.send(command)` with no try/catch. If R2 is unreachable, the raw AWS SDK error propagates. This could leak R2 configuration details in the error response.

### Finding 17-53: Content-safety autoRemoveContent is not atomic
- **File:** `apps/api/src/modules/moderation/content-safety.service.ts`, lines 174-209
- **Severity:** MEDIUM
- **Category:** Non-atomic operation
- **Description:** `autoRemoveContent()` first updates the content (e.g., `post.update`), then creates a moderation log. These are separate queries, not wrapped in a transaction. If the log creation fails, content is removed but there's no audit trail.

---

## Summary

| Tier | Count | Key Themes |
|------|-------|-----------|
| **T0 — Ship Blockers** | 11 | Free coins/money (6 endpoints), moderation fails open (2 services), diamonds lost on transfer failure |
| **T1 — Security** | 12 | SQL injection, SSRF (4 vectors), Stripe errors leaking, dev stack traces, inconsistent Stripe state |
| **T2 — Data Integrity** | 12 | Dual balance systems, premature status changes, race conditions, silent error swallowing, GDPR export caps |
| **T3 — Quality** | 18 | Missing timeouts, no try/catch on external APIs, unsafe JSON.parse of LLM output, Redis TTL time bombs |
| **TOTAL** | **53** | |

### Critical Pattern: "Moderation Fails Open"
The most dangerous systemic pattern: **every** content moderation service returns `safe: true` / `classification: 'SAFE'` on ANY error. This means:
- If the ANTHROPIC_API_KEY is wrong or expired: all content auto-approved
- If Claude API is rate-limited: all content auto-approved
- If network is flaky: all content auto-approved
- If the LLM is tricked by prompt injection: content auto-approved

For a platform serving the Muslim community, especially one targeting families, this is an existential safety risk.

### Critical Pattern: "Payment Not Required"
6 separate financial operations create records and credit balances with ZERO payment verification:
1. `gifts.service.ts` — `purchaseCoins()` — unlimited free coins
2. `stripe-connect.service.ts` — `purchaseCoins()` — coins before payment
3. `monetization.service.ts` — `sendTip()` — free tips marked 'completed'
4. `commerce.service.ts` — `subscribePremium()` — free premium
5. `commerce.service.ts` — `donateZakat()` — fake donations up to $1M
6. `commerce.service.ts` — `contributeTreasury()` — fake contributions up to $1M
