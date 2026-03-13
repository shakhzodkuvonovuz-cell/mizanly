# BATCH 36: Payments + Moderation + Push Wiring + Communities — 10 Agents

**Date:** 2026-03-13
**Theme:** Revenue enablement, safety infrastructure, and filling the last major feature gap. All agents create NEW files or modify ONLY their listed files. Zero conflicts.

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. After completing: `git add -A && git commit -m "feat: batch 36 agent N — <description>"`

---

## AGENT 1: Stripe Payment Backend Module

**Creates:**
- `apps/api/src/modules/payments/payments.module.ts`
- `apps/api/src/modules/payments/payments.controller.ts`
- `apps/api/src/modules/payments/payments.service.ts`
- `apps/api/src/modules/payments/stripe-webhook.controller.ts`

**Prisma:** No new models needed. Uses existing `Tip`, `MembershipSubscription` models. Add payment fields via raw SQL or Prisma @map if needed — but prefer NOT modifying schema. Store Stripe IDs in existing `status` fields or a simple JSON metadata approach.

**Endpoints (6):**
```
POST   /payments/create-payment-intent    — Create Stripe PaymentIntent for tip (auth, body: { amount, currency, receiverId })
POST   /payments/create-subscription      — Create Stripe Subscription for membership (auth, body: { tierId, paymentMethodId })
DELETE /payments/cancel-subscription       — Cancel Stripe Subscription (auth, body: { subscriptionId })
GET    /payments/payment-methods           — List user's saved payment methods (auth)
POST   /payments/attach-payment-method     — Attach payment method to customer (auth, body: { paymentMethodId })
POST   /payments/webhooks/stripe           — Stripe webhook handler (NO auth — uses Stripe signature verification)
```

**Service patterns:**
- Use `stripe` npm package: `import Stripe from 'stripe'`
- Initialize: `new Stripe(process.env.STRIPE_SECRET_KEY)`
- Create Stripe Customer on first payment (store customerId in User model or cache)
- PaymentIntent for one-time tips
- Subscription for recurring memberships
- Webhook handler: `payment_intent.succeeded` → update Tip status, `invoice.paid` → extend subscription, `customer.subscription.deleted` → cancel subscription

**Webhook controller:**
- Use `@RawBody()` decorator for signature verification
- Verify with `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`
- Log all events, only process known types

**env vars needed:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (user will add to .env)

**~400-500 lines total**

---

## AGENT 2: Mobile Payment Sheet Integration

**Creates:**
- `apps/mobile/src/services/paymentsApi.ts`
- `apps/mobile/src/types/payments.ts`
- `apps/mobile/src/hooks/usePayment.ts`

**paymentsApi.ts:** Mirror backend payment endpoints.

**types/payments.ts:**
```tsx
export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
}

export interface PaymentMethod {
  id: string;
  brand: string;  // visa, mastercard, etc.
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface CreatePaymentIntentDto {
  amount: number;
  currency: string;
  receiverId: string;
}

export interface CreateSubscriptionDto {
  tierId: string;
  paymentMethodId: string;
}
```

**usePayment.ts (~150 lines):**
```tsx
// Hook that wraps @stripe/stripe-react-native
// Uses initPaymentSheet + presentPaymentSheet for one-time payments
// Uses confirmPayment for subscriptions
// Manages loading/error states
// Returns: { payTip, subscribeTier, loading, error }

import { useStripe } from '@stripe/stripe-react-native';
import { paymentsApi } from '@/services/paymentsApi';

export function usePayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payTip = async (receiverId: string, amount: number) => {
    setLoading(true);
    try {
      const { data } = await paymentsApi.createPaymentIntent({ amount, currency: 'usd', receiverId });
      await initPaymentSheet({ paymentIntentClientSecret: data.clientSecret, merchantDisplayName: 'Mizanly' });
      const result = await presentPaymentSheet();
      if (result.error) throw new Error(result.error.message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const subscribeTier = async (tierId: string, paymentMethodId: string) => { ... };

  return { payTip, subscribeTier, loading, error };
}
```

**~250-350 lines total across 3 files**

---

## AGENT 3: Content Moderation Service Backend

**Creates:**
- `apps/api/src/modules/moderation/moderation.module.ts`
- `apps/api/src/modules/moderation/moderation.controller.ts`
- `apps/api/src/modules/moderation/moderation.service.ts`
- `apps/api/src/modules/moderation/word-filter.ts`

**Endpoints (5):**
```
POST   /moderation/check-text       — Check text for violations (auth, body: { text, context? })
POST   /moderation/check-image      — Check image URL for violations (auth, body: { imageUrl })
GET    /moderation/queue             — Get pending moderation queue (admin only)
PATCH  /moderation/review/:id        — Review flagged content (admin only, body: { action: 'approve'|'remove'|'warn' })
GET    /moderation/stats             — Moderation stats (admin only)
```

**word-filter.ts:**
```typescript
// Static list of prohibited terms (slurs, spam patterns, etc.)
// Categories: hate_speech, spam, nsfw_text, harassment, self_harm
// Returns: { flagged: boolean, categories: string[], severity: 'low'|'medium'|'high', matches: string[] }

const PROHIBITED_PATTERNS: { pattern: RegExp; category: string; severity: string }[] = [
  // Hate speech patterns
  // Spam patterns (repeated chars, known spam phrases)
  // NSFW text patterns
  // URL spam patterns
];

export function checkText(text: string): TextCheckResult { ... }
```

**Service patterns:**
- `checkText()`: Run word filter, return violations
- `checkImage()`: For now, return `{ safe: true }` placeholder (real image moderation = external API like AWS Rekognition, add later)
- `flagContent()`: Create moderation record in DB
- Queue management for admin review
- Auto-action on high-severity: hide content immediately, notify user
- Stats: flagged today, reviewed, auto-removed, false positives

**Prisma:** Uses existing `Report` model for flagged content queue. If Report model doesn't have needed fields, store moderation metadata in the `details` field.

**~500-600 lines total**

---

## AGENT 4: Push Trigger Wiring — Posts + Likes + Comments

**Modifies:**
- `apps/api/src/modules/posts/posts.service.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`

**What to do:** Add `PushTriggerService` injection and call `triggerPush()` after creating notifications.

**In notifications.service.ts:**
1. Import `PushTriggerService` from `./push-trigger.service`
2. Inject in constructor: `private pushTrigger: PushTriggerService`
3. After every `this.prisma.notification.create(...)` call, add:
   ```typescript
   // Fire push notification (non-blocking)
   this.pushTrigger.triggerPush(notification.id).catch(() => {});
   ```

**Important:** Find ALL places where notifications are created and add the trigger. Search for `prisma.notification.create` in the service.

**~20-40 lines changed across 2 files**

---

## AGENT 5: Push Trigger Wiring — Follows + Messages

**Modifies:**
- `apps/api/src/modules/follows/follows.service.ts`
- `apps/api/src/modules/messages/messages.service.ts`

**Same pattern as Agent 4:** Import PushTriggerService, inject, call triggerPush after notification creation.

**In follows.service.ts:** After follow notification create → `triggerPush(notification.id)`
**In messages.service.ts:** After message notification create → `triggerPush(notification.id)`

**Important:** Also add the import of `NotificationsModule` or direct `PushTriggerService` import in the respective modules if not already available. Check if follows.module.ts and messages.module.ts need to import NotificationsModule.

**~20-40 lines changed across 2 files**

---

## AGENT 6: Communities Backend Module

**Creates:**
- `apps/api/src/modules/communities/communities.module.ts`
- `apps/api/src/modules/communities/communities.controller.ts`
- `apps/api/src/modules/communities/communities.service.ts`

**Note:** Check if a `Community` model exists in Prisma schema. If not, use a simple approach:
- Communities can be stored using the existing `Circle` model (circles are basically communities)
- OR create endpoints that work with a minimal data structure

**Endpoints (8):**
```
POST   /communities              — Create community (auth, body: { name, description, coverUrl?, rules?, isPrivate })
GET    /communities              — List communities (optional auth, cursor pagination)
GET    /communities/:id          — Get community detail (optional auth)
PATCH  /communities/:id          — Update community (auth, owner/admin only)
DELETE /communities/:id          — Delete community (auth, owner only)
POST   /communities/:id/join     — Join community (auth)
DELETE /communities/:id/leave    — Leave community (auth)
GET    /communities/:id/members  — List members (optional auth, pagination)
```

**Service patterns:**
- Use Circle model if it has the right fields, or use a generic approach
- Owner = creator, can assign admins
- Private communities require approval to join
- Member counts in list response

**~400-500 lines total**

---

## AGENT 7: Wire Communities into Screens

**Modifies:**
- `apps/mobile/app/(screens)/communities.tsx`
- `apps/mobile/app/(screens)/create-event.tsx` (remove MOCK_COMMUNITIES, wire to real API)

**Creates:**
- `apps/mobile/src/services/communitiesApi.ts`
- `apps/mobile/src/types/communities.ts`

**communities.tsx:** Replace mock data with real API calls to communitiesApi.
**create-event.tsx:** Replace `MOCK_COMMUNITIES` (line 40) with real fetch from communitiesApi.

**~100-200 lines changed/created**

---

## AGENT 8: i18n Rollout — Remaining Screens Batch 1 (20 files)

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/2fa-verify.tsx`
- `apps/mobile/app/(screens)/account-switcher.tsx`
- `apps/mobile/app/(screens)/archive.tsx`
- `apps/mobile/app/(screens)/blocked.tsx`
- `apps/mobile/app/(screens)/blocked-keywords.tsx`
- `apps/mobile/app/(screens)/bookmark-collections.tsx`
- `apps/mobile/app/(screens)/bookmark-folders.tsx`
- `apps/mobile/app/(screens)/camera.tsx`
- `apps/mobile/app/(screens)/circles.tsx`
- `apps/mobile/app/(screens)/close-friends.tsx`
- `apps/mobile/app/(screens)/communities.tsx` (only if Agent 7 hasn't added it)
- `apps/mobile/app/(screens)/dhikr-counter.tsx`
- `apps/mobile/app/(screens)/drafts.tsx`
- `apps/mobile/app/(screens)/enable-tips.tsx`
- `apps/mobile/app/(screens)/follow-requests.tsx`
- `apps/mobile/app/(screens)/image-editor.tsx`
- `apps/mobile/app/(screens)/islamic-calendar.tsx`
- `apps/mobile/app/(screens)/quran-share.tsx`
- `apps/mobile/app/(screens)/zakat-calculator.tsx`
- `apps/mobile/app/(screens)/ramadan-mode.tsx`

**Pattern:** Add `import { useTranslation } from '@/hooks/useTranslation'` + `const { t } = useTranslation()` + replace all hardcoded English strings with `t()` calls.

**~200-300 lines changed across 20 files**

---

## AGENT 9: i18n Rollout — Remaining Screens Batch 2 (20 files)

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/account-settings.tsx`
- `apps/mobile/app/(screens)/appeal-moderation.tsx`
- `apps/mobile/app/(screens)/audio-library.tsx`
- `apps/mobile/app/(screens)/broadcast-channels.tsx`
- `apps/mobile/app/(screens)/broadcast/[id].tsx`
- `apps/mobile/app/(screens)/caption-editor.tsx`
- `apps/mobile/app/(screens)/chat-theme-picker.tsx`
- `apps/mobile/app/(screens)/collab-requests.tsx`
- `apps/mobile/app/(screens)/community-posts.tsx`
- `apps/mobile/app/(screens)/conversation-media.tsx`
- `apps/mobile/app/(screens)/create-broadcast.tsx`
- `apps/mobile/app/(screens)/create-playlist.tsx`
- `apps/mobile/app/(screens)/create-post.tsx`
- `apps/mobile/app/(screens)/create-reel.tsx`
- `apps/mobile/app/(screens)/create-thread.tsx`
- `apps/mobile/app/(screens)/create-video.tsx`
- `apps/mobile/app/(screens)/edit-channel.tsx`
- `apps/mobile/app/(screens)/green-screen-editor.tsx`
- `apps/mobile/app/(screens)/video-editor.tsx`
- `apps/mobile/app/(screens)/voice-recorder.tsx`

**Same i18n pattern as Agent 8.**

**~200-300 lines changed across 20 files**

---

## AGENT 10: i18n Rollout — Remaining Screens Batch 3 (16 files)

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/followers/[userId].tsx`
- `apps/mobile/app/(screens)/following/[userId].tsx`
- `apps/mobile/app/(screens)/hashtag-explore.tsx`
- `apps/mobile/app/(screens)/hashtag/[tag].tsx`
- `apps/mobile/app/(screens)/live/[id].tsx`
- `apps/mobile/app/(screens)/majlis-lists.tsx`
- `apps/mobile/app/(screens)/manage-broadcast.tsx`
- `apps/mobile/app/(screens)/muted.tsx`
- `apps/mobile/app/(screens)/mutual-followers.tsx`
- `apps/mobile/app/(screens)/my-reports.tsx`
- `apps/mobile/app/(screens)/pinned-messages.tsx`
- `apps/mobile/app/(screens)/playlist/[id].tsx`
- `apps/mobile/app/(screens)/playlists/[channelId].tsx`
- `apps/mobile/app/(screens)/qr-code.tsx`
- `apps/mobile/app/(screens)/qr-scanner.tsx`
- `apps/mobile/app/(screens)/report.tsx`
- `apps/mobile/app/(screens)/reports/[id].tsx`
- `apps/mobile/app/(screens)/save-to-playlist.tsx`
- `apps/mobile/app/(screens)/saved.tsx`
- `apps/mobile/app/(screens)/schedule-live.tsx`
- `apps/mobile/app/(screens)/schedule-post.tsx`
- `apps/mobile/app/(screens)/search-results.tsx`
- `apps/mobile/app/(screens)/share-profile.tsx`
- `apps/mobile/app/(screens)/sound/[id].tsx`
- `apps/mobile/app/(screens)/starred-messages.tsx`
- `apps/mobile/app/(screens)/sticker-browser.tsx`
- `apps/mobile/app/(screens)/theme-settings.tsx`
- `apps/mobile/app/(screens)/trending-audio.tsx`
- `apps/mobile/app/(screens)/watch-history.tsx`
- `apps/mobile/app/(tabs)/minbar.tsx`

**Same i18n pattern. Skip any file that already has useTranslation.**

**~200-400 lines changed**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files | Type |
|-------|-------|------|
| 1 | modules/payments/ (4 NEW files) | Backend |
| 2 | services/paymentsApi.ts, types/payments.ts, hooks/usePayment.ts (3 NEW) | Mobile |
| 3 | modules/moderation/ (4 NEW files) | Backend |
| 4 | posts.service.ts, notifications.service.ts (MODIFY) | Backend |
| 5 | follows.service.ts, messages.service.ts (MODIFY) | Backend |
| 6 | modules/communities/ (3 NEW files) | Backend |
| 7 | communities.tsx, create-event.tsx (MODIFY) + communitiesApi.ts, communities types (NEW) | Mobile |
| 8 | 20 screen files (MODIFY — i18n) | Mobile |
| 9 | 20 screen files (MODIFY — i18n) | Mobile |
| 10 | ~30 remaining screen files + minbar tab (MODIFY — i18n) | Mobile |

**ZERO file conflicts between any agents.**

---

## POST-BATCH TASKS

1. Register new modules in `app.module.ts`: PaymentsModule, ModerationModule, CommunitiesModule
2. `cd apps/api && npm install stripe`
3. `cd apps/mobile && npm install @stripe/stripe-react-native`
4. Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
5. Run `npx prisma db push` if any schema changes needed
6. Fill missing i18n keys in en.json and ar.json
7. Test Stripe webhook with `stripe listen --forward-to localhost:3000/api/v1/payments/webhooks/stripe`
