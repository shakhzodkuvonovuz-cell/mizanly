# Agent #62 — Email + External Webhooks + Clerk Integration

**Scope:** All email, Clerk webhook, Stripe webhook, Cloudflare Stream webhook, community webhook (outbound), and webhook queue infrastructure files.

**Files Audited (line-by-line):**
- `apps/api/src/common/services/email.service.ts` (166 lines)
- `apps/api/src/common/services/email.module.ts` (11 lines)
- `apps/api/src/modules/auth/webhooks.controller.ts` (90 lines)
- `apps/api/src/modules/auth/webhooks.controller.spec.ts` (146 lines)
- `apps/api/src/modules/auth/auth.service.ts` (213 lines)
- `apps/api/src/modules/auth/auth.module.ts` (11 lines)
- `apps/api/src/modules/payments/stripe-webhook.controller.ts` (91 lines)
- `apps/api/src/modules/payments/stripe-webhook.controller.spec.ts` (111 lines)
- `apps/api/src/modules/payments/payments.service.ts` (420 lines)
- `apps/api/src/modules/payments/payments.module.ts` (14 lines)
- `apps/api/src/modules/payments/payments.service.edge.spec.ts` (79 lines)
- `apps/api/src/modules/webhooks/webhooks.service.ts` (109 lines)
- `apps/api/src/modules/webhooks/webhooks.controller.ts` (42 lines)
- `apps/api/src/modules/webhooks/webhooks.module.ts` (11 lines)
- `apps/api/src/modules/webhooks/webhooks.service.spec.ts` (183 lines)
- `apps/api/src/modules/webhooks/webhooks.controller.spec.ts` (77 lines)
- `apps/api/src/modules/stream/stream.controller.ts` (91 lines)
- `apps/api/src/modules/stream/stream.service.ts` (178 lines)
- `apps/api/src/modules/stream/stream.service.spec.ts` (345 lines)
- `apps/api/src/modules/stream/stream.controller.spec.ts` (62 lines)
- `apps/api/src/modules/monetization/stripe-connect.service.ts` (268 lines)
- `apps/api/src/modules/monetization/stripe-connect.service.spec.ts` (139 lines)
- `apps/api/src/modules/discord-features/discord-features.service.ts` (lines 100-160)
- `apps/api/src/modules/discord-features/discord-features.controller.ts` (lines 90-120)
- `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` (34 lines)
- `apps/api/src/common/queue/processors/webhook.processor.ts` (112 lines)
- `apps/api/src/common/queue/queue.service.ts` (185 lines)
- `apps/api/src/common/queue/queue.module.ts` (84 lines)
- `apps/api/src/common/queue/processors/media.processor.ts` (159 lines)
- `apps/api/src/main.ts` (131 lines)
- `apps/api/src/app.module.ts` (197 lines)
- `apps/api/.env.example` (55 lines)

**Total findings: 42**

---

## FINDING 1 — CRITICAL: EmailModule Not Imported in AppModule — Email Service Is Dead Code

**File:** `apps/api/src/app.module.ts`
**Lines:** 96-188 (entire imports array)
**Severity:** P0 (Ship Blocker)

The `EmailModule` (defined at `apps/api/src/common/services/email.module.ts`) is NOT imported in `AppModule`. It is declared as `@Global()` and exports `EmailService`, but since it is never imported by any module in the application, the `EmailService` provider is never instantiated or available for injection.

```typescript
// email.module.ts — declares EmailService as global...
@Global()
@Module({
  imports: [ConfigModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

```typescript
// app.module.ts — does NOT import EmailModule
// (verified: EmailModule does not appear anywhere in the imports array)
```

**Impact:** ALL email functionality is completely dead:
- `sendWelcome()` — never called anywhere in codebase
- `sendSecurityAlert()` — never called anywhere in codebase
- `sendWeeklyDigest()` — never called anywhere in codebase
- `sendCreatorWeeklySummary()` — never called anywhere in codebase

Grep confirms `sendWelcome`, `sendSecurityAlert`, `sendWeeklyDigest`, and `sendCreatorWeeklySummary` are only defined in `email.service.ts` and never invoked from any other file. The email templates exist but are 100% dead code — no code path in the entire application sends any email.

---

## FINDING 2 — CRITICAL: CLERK_WEBHOOK_SECRET Is Empty — User Sync Completely Broken

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, line 43-46
**Severity:** P0 (Ship Blocker)

The `.env` file has `CLERK_WEBHOOK_SECRET` set to empty string (documented in CLAUDE.md credential status table). The webhook handler explicitly checks for this and **throws BadRequestException** when the secret is not configured:

```typescript
const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
if (!secret) {
  throw new BadRequestException('Webhook secret not configured');
}
```

**Impact:** Every Clerk webhook delivery (user.created, user.updated, user.deleted) fails with 400 error. This means:
1. New users who sign up via Clerk are never synced to the database (no user record created via webhook)
2. User profile updates in Clerk (name changes, avatar changes, email changes) never propagate
3. User deletions in Clerk never mark accounts as deactivated

The `register()` method in `auth.service.ts` (line 28) provides an alternative path for user creation (called from AuthController), but it requires the user to explicitly POST to the register endpoint. Clerk webhook-based auto-sync is completely non-functional.

---

## FINDING 3 — CRITICAL: STRIPE_WEBHOOK_SECRET Is Empty — Payment Event Processing Lost

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 48-52
**Severity:** P0 (Ship Blocker)

The Stripe webhook controller reads `STRIPE_WEBHOOK_SECRET` directly from `process.env` (not via ConfigService — inconsistency noted separately). When empty:

```typescript
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
  throw new BadRequestException('Webhook secret not configured');
}
```

**Impact:** All Stripe webhook events are rejected. This means:
- `payment_intent.succeeded` — tips remain in "pending" status forever, never marked "completed"
- `invoice.paid` — subscription period end dates never updated
- `customer.subscription.deleted` — cancelled subscriptions never reflected in database
- `payment_method.attached` — logged only, but still fails

Combined with Finding 4 (coins credited before payment confirmed), this creates a scenario where coins are given immediately but the payment confirmation webhook that would validate the charge never arrives.

---

## FINDING 4 — CRITICAL: Coins Credited Before Payment Confirmed (Stripe Connect)

**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 130-136
**Severity:** P0 (Ship Blocker — Free Money)

The `purchaseCoins()` method credits coins to the user's balance **immediately** after creating a payment intent, without waiting for the payment to actually succeed:

```typescript
// Create payment intent
let paymentIntentId = `pi_mock_${Date.now()}`;
if (this.apiAvailable) {
  // ... creates Stripe payment intent
}

// Credit coins (in production, do this in the webhook after payment succeeds)
await this.prisma.user.update({
  where: { id: userId },
  data: { coinBalance: { increment: pkg.coins } },
});
```

The comment at line 130 even acknowledges the bug: "in production, do this in the webhook after payment succeeds". But the webhook that would confirm payment never works (see Finding 3). Even if the webhook were functional, this endpoint gives coins **before** any payment is confirmed, enabling unlimited free coins:
1. Call `purchaseCoins` repeatedly
2. Coins are credited immediately
3. Never complete the payment on the client
4. Payment intent expires but coins remain

---

## FINDING 5 — CRITICAL: Diamonds Deducted Before Transfer Verified (Cashout)

**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 200-222
**Severity:** P0 (Data Integrity — Money Loss)

The `cashout()` method deducts diamonds from the user's balance **before** the Stripe transfer is created, and the transfer result is never checked:

```typescript
// Deduct diamonds
await this.prisma.user.update({
  where: { id: userId },
  data: { diamondBalance: { decrement: diamondAmount } },
});

// Create Stripe transfer + payout
if (this.apiAvailable && user.stripeConnectAccountId) {
  await fetch('https://api.stripe.com/v1/transfers', {
    // ... transfer request
  });
  // NOTE: Response is never checked! Transfer may have failed.
}
```

If the Stripe transfer fails (insufficient platform balance, invalid connected account, network error), the diamonds are already deducted but no money was sent. The creator loses their diamonds with no recourse. There is no reversal mechanism.

---

## FINDING 6 — HIGH: Route Collision — Two Controllers on `/webhooks` Path

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, line 23
**File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, line 10
**Severity:** P1 (Route Collision)

Both controllers register on the `webhooks` base path:

```typescript
// auth/webhooks.controller.ts
@Controller('webhooks')
export class WebhooksController {  // Clerk webhook: POST /webhooks/clerk
```

```typescript
// webhooks/webhooks.controller.ts
@Controller('webhooks')
export class WebhooksController {  // Community webhooks: POST /webhooks, GET /webhooks, etc.
```

Both classes are also named `WebhooksController`, which creates ambiguity in logs, Swagger docs, and DI error messages.

However, the community `WebhooksModule` is **not imported in AppModule** (verified by checking app.module.ts imports). So the community webhooks controller is effectively dead code. The routes don't actually collide at runtime because only the auth module's WebhooksController is loaded, but this means the community webhook CRUD API (`POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id`, `POST /webhooks/:id/test`) is completely non-functional.

**Impact:** Community webhook management endpoints are unreachable. The `WebhooksService.dispatch()` method works (it queries the database directly), but no webhooks can be created/listed/deleted through the API.

---

## FINDING 7 — HIGH: WebhooksModule Not Imported — Community Webhook CRUD Dead

**File:** `apps/api/src/app.module.ts`
**Lines:** 96-188
**Severity:** P1 (Feature Dead)

`WebhooksModule` from `apps/api/src/modules/webhooks/webhooks.module.ts` is not in the AppModule imports array. The module provides `WebhooksController` and `WebhooksService`. While `WebhooksService` is exported and could theoretically be imported by other modules, without the module being imported:
- The webhook CRUD controller is not registered
- The `WebhooksService` provider is not available
- All outbound webhook functionality (create, list, delete, test, dispatch) is inaccessible via HTTP

The `QueueService.addWebhookDeliveryJob()` exists (queue.service.ts line 99) but is **never called** by any other service in the codebase (verified by grep — only appears in queue.service.ts and mock-providers.ts). So the BullMQ webhook queue and `WebhookProcessor` exist but receive zero jobs.

---

## FINDING 8 — HIGH: No Idempotency in Clerk Webhook Handler

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 68-88
**Severity:** P1 (Data Integrity)

The Clerk webhook handler processes every event without checking if it has already been processed. Clerk may retry webhook deliveries if the first attempt times out or returns a non-200 status. The `svix-id` header provides a unique event ID but it is only used for signature verification, never stored.

```typescript
const { type, data } = event;
this.logger.log(`Clerk webhook received: ${type}`);

// No deduplication check — same event processed multiple times
if (type === 'user.created' || type === 'user.updated') {
  await this.authService.syncClerkUser(data.id, { ... });
}
```

The `syncClerkUser` method uses `prisma.user.upsert` (auth.service.ts line 190), which is inherently idempotent for creates/updates. However:
- The `deactivateByClerkId` call for `user.deleted` events uses `updateMany` which is also idempotent
- But if any future event handler adds non-idempotent operations (e.g., sending welcome emails, crediting bonuses), the lack of deduplication becomes a real bug

Best practice: Store processed `svix-id` values in Redis with a TTL to prevent reprocessing.

---

## FINDING 9 — HIGH: No Idempotency in Stripe Webhook Handler

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 62-87
**Severity:** P1 (Data Integrity — Double Processing)

The Stripe webhook handler has no idempotency protection. Stripe retries webhooks for up to 3 days. The `event.id` (unique per Stripe event) is never stored or checked.

```typescript
switch (event.type) {
  case 'payment_intent.succeeded': {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await this.paymentsService.handlePaymentIntentSucceeded(paymentIntent);
    break;
  }
  // ... other cases
}
```

In `handlePaymentIntentSucceeded` (payments.service.ts line 353):
```typescript
await this.prisma.tip.update({
  where: { id: tipId },
  data: { status: 'completed', message: JSON.stringify({...}) },
});
await this.redis.del(`payment_intent:${paymentIntent.id}`);
```

After the first successful processing, the Redis mapping is deleted (line 374). On retry, `redis.get` returns `null` and the handler silently returns — this is **accidentally idempotent** but fragile. If Redis is temporarily down during the delete but the DB update succeeded, the retry would try to update the tip again (which is safe since it's a status change to the same value). But the `handleInvoicePaid` handler (line 377) makes an additional Stripe API call to retrieve the subscription, which is wasteful on retries.

---

## FINDING 10 — HIGH: Stripe Webhook Controller Uses process.env Instead of ConfigService

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 31 and 48
**Severity:** P1 (Inconsistency / Testing Difficulty)

The controller reads environment variables in two different ways:
- Line 31: `process.env.STRIPE_SECRET_KEY || ''` (direct env access)
- Line 48: `process.env.STRIPE_WEBHOOK_SECRET` (direct env access)

But the Clerk webhook controller uses `this.config.get<string>('CLERK_WEBHOOK_SECRET')` (ConfigService). This inconsistency means:
1. ConfigService overrides (e.g., `.env` files, test overrides) won't work for Stripe
2. The test file must directly manipulate `process.env` (line 22: `process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'`)
3. The `apiVersion` string `'2026-02-25.clover'` is hardcoded, not from config

---

## FINDING 11 — HIGH: XSS via HTML Email Template Injection

**File:** `apps/api/src/common/services/email.service.ts`, lines 79-99, 102-117, 120-147, 149-165
**Severity:** P1 (Security — XSS in Emails)

All email templates directly interpolate user-provided data into HTML without escaping:

```typescript
// sendWelcome — line 81
<h2 style="color: #C8963E; margin: 0 0 16px;">Welcome to Mizanly, ${name}!</h2>

// sendSecurityAlert — line 109
<td style="color: #fff; padding: 8px 0;">${data.device}</td>
<td style="color: #fff; padding: 8px 0;">${data.location}</td>

// sendWeeklyDigest — line 144
${data.topPost ? `<p>...<em style="color: #fff;">"${data.topPost}"</em></p>` : ''}

// sendCreatorWeeklySummary — line 158
<p style="color: #8B949E;">Here's how your content performed this week, ${data.name}:</p>
```

If a user sets their display name to `<script>alert('xss')</script>` or `<img src=x onerror=...>`, this HTML is injected directly into the email body. While most email clients strip scripts, image tags with `onerror` handlers, CSS-based attacks, and phishing-style HTML (fake login forms) can still work in many email clients.

**Fix:** All interpolated values must be HTML-escaped (`&lt;`, `&gt;`, `&amp;`, `&quot;`).

---

## FINDING 12 — HIGH: SSRF via Outbound Webhook URL — No URL Validation

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, lines 13 and 54
**Severity:** P1 (Security — SSRF)

The `create()` method accepts any URL for webhook delivery without validation:

```typescript
async create(userId: string, data: { circleId: string; name: string; url: string; events: string[] }) {
  const secret = randomBytes(32).toString('hex');
  return this.prisma.webhook.create({
    data: {
      circleId: data.circleId,
      name: data.name,
      url: data.url,   // <-- No validation at all
      // ...
    },
  });
}
```

And `deliver()` fetches any URL:
```typescript
async deliver(url: string, secret: string, payload: Record<string, unknown>) {
  const response = await fetch(url, { method: 'POST', ... });
}
```

An attacker can register webhooks pointing to:
- `http://169.254.169.254/latest/meta-data/` — AWS metadata service (steal IAM credentials)
- `http://localhost:3000/api/v1/admin/...` — internal API endpoints
- `http://10.0.0.1/...` — internal network services
- `file:///etc/passwd` — local file read (if fetch implementation supports it)

The webhook controller body parameter (webhooks.controller.ts line 21) uses an inline type `{ circleId: string; name: string; url: string; events: string[] }` rather than a validated DTO, so there is no `@IsUrl()` validation.

The same SSRF vulnerability exists in the `WebhookProcessor` (webhook.processor.ts line 81) which also calls `fetch(url, ...)` without validation.

---

## FINDING 13 — HIGH: Outbound Webhook Create Endpoint Uses Inline Type Instead of DTO

**File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, line 21
**Severity:** P1 (Validation Bypass)

```typescript
@Post()
async create(
  @CurrentUser('id') userId: string,
  @Body() body: { circleId: string; name: string; url: string; events: string[] },
) {
```

The `@Body()` parameter uses an inline type instead of a class-validator DTO. NestJS's `ValidationPipe` with `whitelist: true` only works on classes with decorators. Inline types bypass all validation, meaning:
- `url` can be any string (SSRF, see Finding 12)
- `name` has no length limit (could be megabytes)
- `events` array has no size limit, no value validation
- `circleId` is not validated as a valid ID format
- Additional unexpected properties are not stripped

---

## FINDING 14 — HIGH: Webhook List Endpoint Has No Authorization Check

**File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, lines 26-29
**Severity:** P1 (Authorization Bypass)

```typescript
@Get()
@ApiOperation({ summary: 'List webhooks for a community' })
async list(@Query('circleId') circleId: string) {
  return this.webhooks.list(circleId);
}
```

The `list` method requires `ClerkAuthGuard` (applied at controller level), but **any authenticated user** can list webhooks for **any community** by passing any `circleId`. There is no check that the requesting user is a member or admin of the community. This leaks webhook configuration (names, URLs, events, creation dates) to unauthorized users.

Similarly, the `test` endpoint (line 38) only checks that the webhook exists and was created by the user, but `list` exposes all community webhooks to any logged-in user.

---

## FINDING 15 — MEDIUM: Clerk Webhook Ignores session.created/ended and organization Events

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 71-87
**Severity:** P2 (Incomplete Feature)

The handler only processes three Clerk event types:
- `user.created`
- `user.updated`
- `user.deleted`

It silently ignores (no logging, returns `{ received: true }`):
- `session.created` / `session.ended` — useful for security alerts, active session tracking
- `organization.*` — if Clerk organizations are used
- `email.created` — if tracking email verification
- `user.banned` / `user.unbanned` — if using Clerk's moderation features

Unknown event types fall through with no handling and no warning log. The only log is on line 69:
```typescript
this.logger.log(`Clerk webhook received: ${type}`);
```

This logs the type but doesn't distinguish handled from unhandled events.

---

## FINDING 16 — MEDIUM: syncClerkUser Creates User with Auto-Generated Username That May Collide

**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 190-204
**Severity:** P2 (Data Integrity)

When a user is created via Clerk webhook (before they register), `syncClerkUser` auto-generates a username:

```typescript
return this.prisma.user.upsert({
  where: { clerkId },
  create: {
    clerkId,
    email: data.email,
    username: `user_${clerkId.slice(-8)}`,  // Last 8 chars of clerkId
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
  },
  update: { ... },
});
```

The username `user_${clerkId.slice(-8)}` has collision risk:
- Clerk IDs like `user_2abc1234` and `user_9xyz1234` both produce username `user_1234` (if last 8 chars are the same)
- The `username` field has a unique constraint in Prisma — this will throw a Prisma unique constraint error that is not caught
- The error bubbles up as a 500 internal server error to the webhook caller (Clerk), which will retry, causing repeated failures

---

## FINDING 17 — MEDIUM: deactivateByClerkId Does Not Clean Up User Data

**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 207-212
**Severity:** P2 (Incomplete Feature / Privacy)

```typescript
async deactivateByClerkId(clerkId: string) {
  return this.prisma.user.updateMany({
    where: { clerkId },
    data: { isDeactivated: true, deactivatedAt: new Date() },
  });
}
```

When Clerk sends a `user.deleted` event, the handler only sets `isDeactivated: true`. It does NOT:
- Revoke active sessions/tokens
- Remove the user from socket rooms
- Cancel active subscriptions (Stripe)
- Clean up Redis caches (customer mapping, subscription mappings)
- Notify followers
- Queue content removal or anonymization
- Send a "sorry to see you go" email

The user's content (posts, threads, messages, comments) remains fully visible and attributed. This may violate GDPR Article 17 (right to erasure) if the deletion was initiated by the user.

---

## FINDING 18 — MEDIUM: Stripe Webhook Missing Common Event Types

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, lines 64-87
**Severity:** P2 (Incomplete Feature)

Only 4 event types are handled:
- `payment_intent.succeeded`
- `invoice.paid`
- `customer.subscription.deleted`
- `payment_method.attached`

Missing critical event types:
- `payment_intent.payment_failed` — user's payment failed (should notify, update tip status to "failed")
- `charge.dispute.created` — chargeback filed (should freeze account, flag content)
- `customer.subscription.updated` — plan changes, pause, resume
- `invoice.payment_failed` — subscription renewal failed (should downgrade or notify)
- `checkout.session.completed` — if using Checkout Sessions
- `account.updated` — for Connect accounts (onboarding status changes)
- `payout.failed` / `payout.paid` — for creator cashout tracking

The `default` case (line 85) only logs at `debug` level:
```typescript
default:
  this.logger.debug(`Unhandled event type: ${event.type}`);
```

This means failed payments and disputes are silently ignored.

---

## FINDING 19 — MEDIUM: Stripe PaymentIntent Mapping Uses Redis TTL — Can Expire Before Webhook Arrives

**File:** `apps/api/src/modules/payments/payments.service.ts`, line 76
**Severity:** P2 (Data Loss)

```typescript
private async storePaymentIntentMapping(paymentIntentId: string, tipId: string) {
  await this.redis.setex(`payment_intent:${paymentIntentId}`, 60 * 60 * 24 * 7, tipId);
}
```

The mapping expires after 7 days. However:
- Stripe PaymentIntents can remain in `requires_action` or `requires_confirmation` state for up to 7 days
- Stripe retries webhook delivery for up to 3 days
- In the worst case (user takes 5 days to confirm + Stripe retries for 3 days), the mapping could expire before the webhook arrives

When the mapping is missing, `handlePaymentIntentSucceeded` silently returns:
```typescript
const tipId = await this.redis.get(`payment_intent:${paymentIntent.id}`);
if (!tipId) {
  this.logger.warn(`No tip found for payment intent ${paymentIntent.id}`);
  return;  // Tip stays "pending" forever
}
```

**Fix:** Store the mapping in the database (not just Redis) or use Stripe metadata to look up the tip.

---

## FINDING 20 — MEDIUM: Subscription Mapping Also Uses Redis TTL — Can Expire

**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 82-84
**Severity:** P2 (Data Loss)

```typescript
private async storeSubscriptionMapping(stripeSubscriptionId: string, subscriptionId: string) {
  await this.redis.setex(`subscription:${stripeSubscriptionId}`, 60 * 60 * 24 * 30, subscriptionId);
  await this.redis.setex(`subscription:internal:${subscriptionId}`, 60 * 60 * 24 * 30, stripeSubscriptionId);
}
```

Subscription mappings expire after 30 days. Subscriptions are long-lived (months/years). After 30 days:
- `handleInvoicePaid` can't find the subscription mapping — renewal invoices are silently ignored
- `handleSubscriptionDeleted` can't find the subscription — cancellation never reflected in DB
- User appears to have active subscription forever (never expires, never renews properly)

---

## FINDING 21 — MEDIUM: Stripe API Version Hardcoded as Future Date

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 32
**File:** `apps/api/src/modules/payments/payments.service.ts`, line 28
**Severity:** P2 (Maintenance)

```typescript
this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover',
});
```

The Stripe API version `'2026-02-25.clover'` appears to be a fictional/placeholder version. Stripe API versions follow the format `YYYY-MM-DD` and the `.clover` suffix is not standard. If this is not a valid version, the Stripe SDK will either ignore it (using the account's default version) or throw an initialization error.

This is hardcoded in two separate places (webhook controller and payments service), making it easy to forget updating one.

---

## FINDING 22 — MEDIUM: Cloudflare Stream Webhook Unauthenticated When Secret Unset

**File:** `apps/api/src/modules/stream/stream.controller.ts`, lines 42-48
**Severity:** P2 (Security)

```typescript
if (this.webhookSecret) {
  if (!signature) {
    throw new UnauthorizedException('Missing webhook signature');
  }
  this.verifySignature(JSON.stringify(body), signature);
}
```

When `CF_STREAM_WEBHOOK_SECRET` is not set (which it isn't — it's not in `.env.example`), the signature check is **completely skipped**. Any external caller can send fabricated webhook events to `POST /api/v1/stream/webhook` with arbitrary payloads, potentially:
- Marking any video as "ready" with attacker-controlled HLS/DASH URLs
- Setting any video's status to error/DRAFT

The test file (stream.controller.spec.ts line 26) explicitly sets the secret to empty string `''`, confirming this is the expected production state.

---

## FINDING 23 — MEDIUM: Stream Webhook Uses JSON.stringify(body) for Signature Verification Instead of Raw Body

**File:** `apps/api/src/modules/stream/stream.controller.ts`, line 47
**Severity:** P2 (Security — Signature Bypass)

```typescript
this.verifySignature(JSON.stringify(body), signature);
```

The webhook handler verifies the signature against `JSON.stringify(body)`, but `body` has already been parsed by NestJS's JSON parser. `JSON.stringify` of a parsed object may not produce the same byte sequence as the original raw body (different key ordering, whitespace). Cloudflare computes the signature over the original raw body.

The Clerk webhook handler (auth/webhooks.controller.ts) correctly uses `req.rawBody` for this purpose. The Stream webhook handler should do the same — `rawBody: true` is enabled in main.ts (line 53), so `req.rawBody` is available.

This means even if `CF_STREAM_WEBHOOK_SECRET` were configured, signature verification might fail for valid webhooks or succeed for tampered ones.

---

## FINDING 24 — MEDIUM: Outbound Webhook Delivery Has Two Competing Implementations

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts` (sync, in-process)
**File:** `apps/api/src/common/queue/processors/webhook.processor.ts` (async, via BullMQ)
**Severity:** P2 (Dead Code / Architecture)

There are two completely separate webhook delivery implementations:

1. **Synchronous** (`webhooks.service.ts`, `deliver()` method, lines 54-83): Retries 3 times with 1s/2s/4s backoff, runs inline in the request handler via `dispatch()`.

2. **Asynchronous** (`webhook.processor.ts`, `deliverWebhook()` method, lines 74-110): Runs via BullMQ queue, retries 5 times with 1s/5s/30s/5m/30m backoff, includes delivery ID header.

The queue-based implementation is more robust (longer retry windows, job persistence, concurrency control) but is **never used**. `addWebhookDeliveryJob()` in `queue.service.ts` is never called by any service. The `WebhooksService.dispatch()` uses the synchronous version.

This means:
- Webhook delivery blocks the HTTP request
- If the server crashes mid-delivery, retries are lost
- The BullMQ webhook processor is pure dead code

---

## FINDING 25 — MEDIUM: Outbound Webhook Delivery Does Not Record Delivery Attempts

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, lines 54-83
**Severity:** P2 (Observability)

The `deliver()` method returns `{ success: boolean; statusCode?: number }` but does not persist delivery attempts anywhere. The test mock in webhooks.service.spec.ts (line 29) defines a `webhookDelivery` model on Prisma, suggesting a `WebhookDelivery` table was intended but is never used:

```typescript
webhookDelivery: {
  create: jest.fn().mockResolvedValue({}),
  findMany: jest.fn().mockResolvedValue([]),
},
```

This model does not appear to exist in the Prisma schema (the `Webhook` model has no `deliveries` relation). Without delivery logs:
- Users can't debug why their webhooks fail
- No audit trail for webhook deliveries
- `test()` endpoint returns delivery result but it's lost after the response

---

## FINDING 26 — MEDIUM: Webhook Secret Can Be Null — HMAC Computed with Empty String

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, lines 47 and 98
**Severity:** P2 (Security)

The Prisma schema defines `secret` as `String?` (nullable). When the secret is null, the code falls back to empty string:

```typescript
// test()
return this.deliver(webhook.url!, webhook.secret ?? '', payload);

// dispatch()
const result = await this.deliver(webhook.url!, webhook.secret ?? '', payload);
```

And in `deliver()`:
```typescript
const signature = createHmac('sha256', secret).update(body).digest('hex');
```

Computing HMAC-SHA256 with an empty string key is technically valid but provides zero security — any recipient can compute the same signature. The `create()` method (line 14) always generates a secret with `randomBytes(32).toString('hex')`, so newly created webhooks will have secrets. But if a webhook's secret is later set to null via direct DB update, all signatures become trivially forgeable.

---

## FINDING 27 — MEDIUM: Webhook Dispatch Does Not Verify User Owns Circle

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`, line 88
**Severity:** P2 (Authorization)

The `dispatch()` method takes a `circleId` and dispatches to all active webhooks for that circle. It is designed to be called internally by other services when events occur. However, if any service passes an incorrect `circleId`, webhooks for the wrong community would be triggered.

More importantly, the `create()` method (line 13) does not verify that `userId` is a member or admin of the specified `circleId`. Any authenticated user can create webhooks for any community.

---

## FINDING 28 — MEDIUM: Discord Execute Webhook Has No Authentication

**File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`, lines 99-104
**Severity:** P2 (Security)

```typescript
@Post('webhooks/:token/execute')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@ApiOperation({ summary: 'Execute webhook (external)' })
executeWebhook(@Param('token') token: string, @Body() dto: ExecuteWebhookDto) {
  return this.service.executeWebhook(token, dto);
}
```

The `executeWebhook` endpoint has no `@UseGuards(ClerkAuthGuard)` — it is intentionally unauthenticated (mimicking Discord's webhook execution model where the token is the auth). However:
- The token is a UUID (predictable format, 128 bits of entropy, but visible in URL)
- Rate limit of 30/min per IP is generous — an attacker who obtains a token can spam messages
- The token is stored as `@default(uuid())` in the database — there's no way to regenerate it without deleting and recreating the webhook
- The token is exposed in the `getWebhooks` response (the service returns all fields including `token`)

---

## FINDING 29 — MEDIUM: Resend API Key Import Uses Dynamic Import — Race Condition

**File:** `apps/api/src/common/services/email.service.ts`, lines 19-32
**Severity:** P2 (Race Condition)

```typescript
private async initResend() {
  const apiKey = this.config.get<string>('RESEND_API_KEY');
  if (!apiKey) {
    this.logger.warn('RESEND_API_KEY not set — emails will be logged only');
    return;
  }

  try {
    const { Resend } = await import('resend');
    this.resend = new Resend(apiKey);
  } catch {
    this.logger.warn('Failed to initialize Resend — emails will be logged only');
  }
}
```

`initResend()` is called from the constructor but is async. If `send()` is called before `initResend()` completes (before the `await import('resend')` resolves), `this.resend` will still be `null` and the email will be logged-only even when Resend is configured. There is no mechanism to wait for initialization.

This is currently moot since EmailService is dead code (Finding 1), but would be a bug if the service were activated.

---

## FINDING 30 — MEDIUM: Stripe Connect Service Uses Raw fetch() Instead of Stripe SDK

**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 44-57, 69-83, 112-128, 208-221
**Severity:** P2 (Maintenance / Security)

The `StripeConnectService` makes direct HTTP requests to `api.stripe.com` using `fetch()` with URL-encoded form data, while the `PaymentsService` and `StripeWebhookController` use the official Stripe SDK. This inconsistency means:
- No automatic retries on network failures (Stripe SDK has built-in retries)
- No request signing or telemetry
- No type safety on request/response bodies
- Response errors are never checked (lines 59, 83, 126 — `response.json()` called without checking `response.ok`)

Example of unchecked response:
```typescript
const response = await fetch('https://api.stripe.com/v1/accounts', { ... });
const account = await response.json();  // If response is 400/401/500, account.id is undefined
const accountId = account.id;           // undefined — stored in DB as null
```

---

## FINDING 31 — MEDIUM: Stripe Connect Account Creation Response Never Validated

**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, lines 58-65
**Severity:** P2 (Data Integrity)

```typescript
const response = await fetch('https://api.stripe.com/v1/accounts', { ... });
const account = await response.json();
const accountId = account.id;

// Store the connected account ID
await this.prisma.user.update({
  where: { id: userId },
  data: { stripeConnectAccountId: accountId },
});
```

If the Stripe API returns an error (e.g., rate limit, invalid parameters), `account.id` is `undefined`. This `undefined` value gets stored as the user's `stripeConnectAccountId`. Later, when `cashout()` checks for `user.stripeConnectAccountId`, it passes the truthiness check (undefined is falsy, so it would actually be caught). But if the response has an error object with an `id` field in a different format, it could corrupt the stored account ID.

---

## FINDING 32 — MEDIUM: Payment Intent Creation Has No Currency Validation

**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 103-107
**Severity:** P2 (Validation)

```typescript
async createPaymentIntent(
  senderId: string,
  receiverId: string,
  amount: number,
  currency: string,
) {
```

The `currency` parameter is not validated. Stripe accepts lowercase 3-letter ISO currency codes. If an invalid currency is passed:
- Stripe will reject with an error that's caught and thrown as `BadRequestException('Payment processing failed — please try again')` — generic, unhelpful
- But if a valid but unexpected currency is passed (e.g., `btc`, `xau`), the tip record is created with that currency while the payment uses it, potentially causing accounting discrepancies

---

## FINDING 33 — LOW: Email Service Logs Email Content at debug Level

**File:** `apps/api/src/common/services/email.service.ts`, line 54
**Severity:** P3 (Privacy)

```typescript
this.logger.debug(`[EMAIL LOG] Body: ${data.html.substring(0, 200)}...`);
```

When Resend is not configured (which is always, since RESEND_API_KEY is not set), the email HTML content is logged. This includes user names, security alert details (device, location), and potentially sensitive information. In production with debug logging enabled, this would write PII to log files.

---

## FINDING 34 — LOW: Email From Address Hardcoded, Not from Config

**File:** `apps/api/src/common/services/email.service.ts`, line 39
**Severity:** P3 (Maintenance)

```typescript
from: 'Mizanly <noreply@mizanly.com>',
```

The from address is hardcoded. This should be configurable via environment variable (e.g., `EMAIL_FROM`) to support different environments (staging, development) and domain changes.

---

## FINDING 35 — LOW: Email Templates Use `flex` Layout — Poor Email Client Support

**File:** `apps/api/src/common/services/email.service.ts`, line 130
**Severity:** P3 (UX)

```html
<div style="display: flex; gap: 16px; margin: 24px 0; flex-wrap: wrap;">
```

The weekly digest template uses `display: flex` with `gap`. Flexbox is poorly supported in email clients:
- Outlook (desktop) — no flex support at all
- Gmail web — partial support, no gap
- Yahoo Mail — no flex support

The stats cards will stack awkwardly or overlap in these clients. Email best practice is to use `<table>` layouts.

---

## FINDING 36 — LOW: Webhook Processor Timestamp Not Used in Signature Verification

**File:** `apps/api/src/common/queue/processors/webhook.processor.ts`, lines 79, 86-87
**Severity:** P3 (Security — Replay Attack)

```typescript
const timestamp = Math.floor(Date.now() / 1000).toString();
// ...
'X-Mizanly-Timestamp': timestamp,
```

The timestamp is sent as a header but is NOT included in the HMAC computation:
```typescript
const signature = createHmac('sha256', secret).update(body).digest('hex');
```

Only the body is signed. The timestamp header can be freely modified by a MITM. Without including the timestamp in the signature, replay attacks are possible — an intercepted webhook payload can be re-sent indefinitely.

The synchronous delivery in `webhooks.service.ts` has the same issue (line 56).

**Best practice:** Sign `${timestamp}.${body}` (as Cloudflare Stream does) to bind the signature to a specific time window.

---

## FINDING 37 — LOW: StripeWebhookController Has Unnecessary @Injectable() Decorator

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 25
**Severity:** P3 (Code Quality)

```typescript
@Injectable()
export class StripeWebhookController {
```

Controllers don't need `@Injectable()` — the `@Controller()` decorator already makes them injectable. The `@Injectable()` decorator is for services/providers. This is harmless but misleading.

---

## FINDING 38 — LOW: Clerk Webhook SkipThrottle at Class Level but Throttle on Method

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, lines 24, 34
**Severity:** P3 (Configuration Confusion)

```typescript
@Controller('webhooks')
@SkipThrottle()                              // Skip throttle for entire controller
export class WebhooksController {
  @Post('clerk')
  @Throttle({ default: { limit: 50, ttl: 60000 } })  // But apply throttle on this method
```

`@SkipThrottle()` at class level tells the global throttler guard to skip this controller. Then `@Throttle()` on the method applies a method-specific throttle. The behavior depends on how NestJS throttler resolves these — typically method-level takes precedence over class-level, so the throttle IS applied. But the `@SkipThrottle()` decorator is confusing and unnecessary.

---

## FINDING 39 — LOW: handlePaymentMethodAttached Is a No-Op

**File:** `apps/api/src/modules/payments/payments.service.ts`, lines 416-419
**Severity:** P3 (Dead Code)

```typescript
async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  // No action needed, but we can log
  this.logger.debug(`Payment method attached: ${paymentMethod.id}`);
}
```

This handler is registered in the webhook switch statement but does nothing. It should either be removed from the switch case (let it fall through to default) or implement actual functionality (e.g., store the payment method association).

---

## FINDING 40 — LOW: Stripe Connect purchaseCoins Mock Payment Intent ID Is Not Unique Enough

**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`, line 109
**Severity:** P3 (Testing / Edge Case)

```typescript
let paymentIntentId = `pi_mock_${Date.now()}`;
```

When `apiAvailable` is false (Stripe key not set), a mock payment intent ID is generated using `Date.now()`. Two rapid calls within the same millisecond would generate the same ID. This mock ID is returned to the client but not stored or used for anything, so the practical impact is minimal.

---

## FINDING 41 — LOW: stripe-connect.service.spec.ts Tests Are Shallow — Don't Test Service Methods

**File:** `apps/api/src/modules/monetization/stripe-connect.service.spec.ts`
**Severity:** P3 (Test Quality)

Most tests in this spec file test Prisma mock calls directly rather than testing the service methods:

```typescript
it('should check if user exists before creating connected account', async () => {
  prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
  expect(prisma.user.findUnique).toBeDefined();  // This tests nothing useful
});
```

The `createConnectedAccount`, `purchaseCoins`, `sendGift`, `cashout`, and `getRevenueDashboard` methods are never actually called in the tests. The "revenue split" tests compute math inline rather than calling service methods. The "webhook verification" test just checks `service instanceof StripeConnectService`.

---

## FINDING 42 — LOW: payments.service.edge.spec.ts Has Incorrect Prisma Mock Shape

**File:** `apps/api/src/modules/payments/payments.service.edge.spec.ts`, lines 30-36
**Severity:** P3 (Test Accuracy)

```typescript
provide: PrismaService,
useValue: {
  user: { findUnique: jest.fn(), update: jest.fn() },
  monetizationTier: { findUnique: jest.fn() },  // Wrong model name
  subscription: { create: jest.fn(), ... },      // Wrong model name
  paymentMethod: { findMany: jest.fn(), ... },   // Wrong model name
```

The actual Prisma models used by PaymentsService are:
- `prisma.tip` (not `subscription`)
- `prisma.membershipTier` (not `monetizationTier`)
- `prisma.membershipSubscription` (not `subscription`)
- Stripe SDK methods (not `paymentMethod` prisma model)

The tests may pass because they test for thrown exceptions before hitting the incorrect mocks, but if the test setup is wrong, the tests don't actually validate the code paths they claim to test.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|-----------|
| P0 (Ship Blocker) | 5 | EmailModule dead, Clerk webhook broken, Stripe webhook broken, free coins, diamonds lost on failed cashout |
| P1 (Critical) | 8 | Route collision, WebhooksModule dead, no idempotency (x2), process.env inconsistency, XSS in emails, SSRF in webhooks, no DTO validation |
| P2 (Medium) | 16 | Missing Clerk events, username collision, no cleanup on delete, missing Stripe events, Redis TTL issues (x2), hardcoded API version, Stream webhook unauthenticated, Stream signature bug, competing implementations, no delivery logs, null secret HMAC, no circle ownership check, unauthenticated execute, race condition, raw fetch |
| P3 (Low) | 13 | PII in logs, hardcoded from address, flex in email, replay attacks, unnecessary decorators, throttle confusion, no-op handler, mock IDs, shallow tests (x2), incorrect mock shape |
| **Total** | **42** | |
