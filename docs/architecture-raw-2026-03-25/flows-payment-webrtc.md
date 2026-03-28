# Payment & WebRTC End-to-End Flow Traces

> Generated 2026-03-25 from source code analysis of:
> - `apps/api/src/modules/monetization/monetization.service.ts` (556 lines)
> - `apps/api/src/modules/gifts/gifts.service.ts` (345 lines)
> - `apps/api/src/modules/commerce/commerce.service.ts` (629 lines)
> - `apps/api/src/modules/payments/payments.service.ts` (617 lines)
> - `apps/api/src/modules/payments/payments.controller.ts` (99 lines)
> - `apps/api/src/modules/payments/stripe-webhook.controller.ts` (128 lines)
> - `apps/api/src/modules/calls/calls.service.ts` (281 lines)
> - `apps/api/src/modules/calls/calls.controller.ts` (91 lines)
> - `apps/api/src/gateways/chat.gateway.ts` (827 lines)
> - `apps/api/src/gateways/dto/chat-events.dto.ts` (77 lines)
> - `apps/mobile/src/hooks/useWebRTC.ts` (373 lines)
> - `apps/mobile/app/(screens)/call/[id].tsx` (653 lines)
> - `apps/mobile/src/services/api.ts` (callsApi at line 1121)

---

## PART 1: PAYMENT FLOWS

### 1.1 Currency Model

```
Real Money (USD)
  |
  v
Coins (purchased via Stripe) ──> sent as gifts ──> Diamonds (earned by creators)
  |                                                    |
  v                                                    v
1 coin = 1 coin (virtual, no USD peg defined)     1 diamond = $0.007 USD
Gift catalog costs: 1-5000 coins                  100 diamonds = $0.70
Creator rate: 70% of coin cost → diamonds         Min cashout: 100 diamonds
```

**Constants (single source of truth):**
- `PLATFORM_FEE_RATE = 0.10` (10% on tips)
- `DIAMOND_TO_USD = 0.007` (1 diamond = $0.007)
- `DIAMONDS_PER_USD_CENT = 100 / 70` (~1.4286)
- `DIAMOND_RATE = 0.7` (creators get 70% of coin cost as diamonds)
- `MIN_CASHOUT_DIAMONDS = 100`
- `MIN_TIP_AMOUNT = $0.50`, `MAX_TIP_AMOUNT = $10,000`

**Dual Balance System (BUG):**
- `CoinBalance` table: `{ userId, coins, diamonds }` — the CORRECT source
- `User.coinBalance` field (legacy Int) — NOT used by services, stale
- Any code reading `User.coinBalance` gets wrong values

---

### 1.2 Flow: Tips (USD Direct)

Two parallel paths exist — `MonetizationService.sendTip()` and `PaymentsService.createPaymentIntent()`. The Stripe-integrated path is in PaymentsService.

#### Path A: MonetizationService.sendTip (no Stripe integration)

```
Mobile → POST /api/v1/monetization/tips
  Body: { receiverId, amount, message? }

  MonetizationService.sendTip():
    1. Validate amount [$0.50 - $10,000]
    2. Validate senderId !== receiverId
    3. Verify receiver exists (User lookup)
    4. Calculate platformFee = amount * 0.10 (Decimal math)
    5. Create Tip record: status='pending'
       { senderId, receiverId, amount, currency:'USD', message, platformFee, status:'pending' }
    6. Return tip with sender/receiver user selects

  PROBLEM: No Stripe PaymentIntent created → tip stays 'pending' forever
           No clientSecret returned → mobile can't collect payment
           This path creates a DB record with no payment mechanism
```

#### Path B: PaymentsService.createPaymentIntent (Stripe-integrated)

```
Mobile → POST /api/v1/payments/create-payment-intent
  Body: { receiverId, amount (cents min 50), currency: usd|gbp|eur|aud|cad }

  PaymentsService.createPaymentIntent():
    1. Validate amount > 0, senderId !== receiverId
    2. Verify receiver exists
    3. getOrCreateStripeCustomer(senderId):
       a. Check Redis: user:customer:{userId}
       b. If miss: fetch User from DB, stripe.customers.create(), cache 30 days
    4. stripe.paymentIntents.create():
       - amount in cents
       - metadata: { senderId, receiverId, amount, currency, type:'tip' }
       - automatic_payment_methods: enabled
    5. Create Tip record: status='pending'
       - message = JSON { stripePaymentIntentId, status:'pending' }
       - platformFee = amount * 0.10
    6. storePaymentIntentMapping(PI.id → tip.id) in Redis (30-day TTL)
    7. Return { clientSecret, amount, currency, tipId }

Mobile receives clientSecret → Stripe SDK confirms payment on device

Stripe webhook → POST /api/v1/payments/webhooks/stripe
  Event: payment_intent.succeeded
    StripeWebhookController:
      1. Verify signature (stripe.webhooks.constructEvent)
      2. Idempotency check: Redis stripe_webhook:{eventId} (7-day TTL)
      3. Route to PaymentsService.handlePaymentIntentSucceeded(PI)
         a. Lookup tipId: Redis payment_intent:{PI.id}
         b. Fallback: DB query Tip where senderId + status='pending' (latest)
         c. Update Tip: status='completed', message=JSON{chargedAt}
         d. Clean up Redis mapping

  Event: payment_intent.payment_failed
    → PaymentsService.handlePaymentIntentFailed(PI)
      a. Same Redis→DB lookup chain
      b. Update Tip: status='failed', message=JSON{failureMessage}
      c. Clean up Redis

  Event: charge.dispute.created
    → PaymentsService.handleDisputeCreated(dispute)
      a. Log CHARGEBACK DISPUTE at error level
      b. If payment_intent found in Redis → update Tip status='disputed'
```

**Gap: Tip never credits receiver.** Neither path adds funds to the receiver's balance. The tip status transitions (pending → completed/failed/disputed) are tracked, but there is no `receiver.balance += (amount - platformFee)` anywhere. The receiver sees completed tips via `getReceivedTips()` but never gets paid.

---

### 1.3 Flow: Gift Purchase + Send + Cashout

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Purchase Coins                                          │
│                                                                 │
│ Mobile → POST /api/v1/gifts/purchase { amount: 1000 }          │
│                                                                 │
│ GiftsService.purchaseCoins():                                   │
│   1. Validate: positive integer, max 100,000                    │
│   2. Create CoinTransaction: type='PURCHASE', amount=1000       │
│      description='Coin purchase pending payment (1000 coins)'   │
│   3. Upsert CoinBalance (ensure record exists, do NOT credit)   │
│   4. Return { coins, diamonds, pendingPurchase, transactionId } │
│                                                                 │
│ *** CRITICAL BUG: NO STRIPE PAYMENTINTENT CREATED ***           │
│ *** No clientSecret returned → mobile can't pay ***             │
│ *** No webhook handler to credit coins after payment ***        │
│ *** Coins are NEVER actually added to CoinBalance ***           │
│                                                                 │
│ The webhook controller handles payment_intent.succeeded but     │
│ only knows about tips (type:'tip' in metadata). There is no     │
│ handler for type:'coin_purchase' or type:'gift_purchase'.       │
│ The handlePaymentIntentSucceeded only updates Tip records.      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Send Gift (assumes coins exist — they don't currently)  │
│                                                                 │
│ Mobile → POST /api/v1/gifts/send                                │
│   Body: { receiverId, giftType, contentId?, contentType? }      │
│                                                                 │
│ GiftsService.sendGift():                                        │
│   1. Validate sender !== receiver                               │
│   2. Look up giftType in GIFT_CATALOG:                          │
│      rose(1), heart(5), star(10), crescent(50), mosque(100),    │
│      diamond(500), crown(1000), galaxy(5000)                    │
│   3. Verify receiver exists                                     │
│   4. Calculate diamondsEarned = floor(coinCost * 0.7)           │
│      e.g., crown(1000 coins) → 700 diamonds                    │
│   5. Atomic deduct: CoinBalance.updateMany                      │
│      WHERE userId=sender AND coins >= coinCost                  │
│      SET coins -= coinCost                                      │
│      (returns 0 if insufficient → throws)                       │
│   6. Transaction (4 ops):                                       │
│      a. GiftRecord.create { sender, receiver, giftType, cost }  │
│      b. CoinBalance.upsert receiver: diamonds += earned         │
│      c. CoinTransaction: GIFT_SENT, -coinCost                  │
│      d. CoinTransaction: GIFT_RECEIVED, +diamondsEarned         │
│   7. Return { gift, giftName, animation, coinCost, diamonds }   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Cashout Diamonds → USD                                  │
│                                                                 │
│ Two duplicate cashout paths exist:                              │
│                                                                 │
│ Path A: POST /api/v1/monetization/wallet/cashout                │
│   Body: { amount: diamonds, payoutSpeed, paymentMethodId }      │
│   MonetizationService.requestCashout():                         │
│     1. Validate integer, >= 100 diamonds                        │
│     2. Verify paymentMethodId present                           │
│     3. Check CoinBalance.diamonds >= requested                  │
│     4. Convert: usdCents = floor(diamonds / 1.4286)             │
│        e.g., 1000 diamonds → 700 cents → $7.00                 │
│     5. Atomic decrement: CoinBalance.updateMany                 │
│        WHERE userId AND diamonds >= requested                   │
│     6. CoinTransaction: CASHOUT, -diamonds                     │
│     7. Return { success: true }                                 │
│     *** NO actual Stripe payout executed ***                    │
│     *** payoutSpeed captured but unused ***                     │
│                                                                 │
│ Path B: POST /api/v1/gifts/cashout                              │
│   Body: { diamonds: number }                                    │
│   GiftsService.cashout():                                       │
│     Same logic but no payoutSpeed/paymentMethodId params        │
│     Returns { diamondsDeducted, usdAmount, remainingDiamonds }  │
│     *** Also no actual Stripe payout ***                        │
│                                                                 │
│ Both paths deduct diamonds from CoinBalance but never call      │
│ Stripe to transfer real money. getPaymentMethods() returns      │
│ placeholder data (Stripe Connect account ID as label).          │
└─────────────────────────────────────────────────────────────────┘
```

---

### 1.4 Flow: Marketplace Orders

```
Mobile → POST /api/v1/commerce/orders
  Body: { productId, quantity?, installments?, shippingAddress? }

CommerceService.createOrder():
  1. ensureStripeAvailable() — throws if no STRIPE_SECRET_KEY
  2. Verify product exists, status=ACTIVE, not own product
  3. Validate quantity (1-100), installments (1-4), check stock
  4. totalAmount = product.price * quantity
  5. stripe.paymentIntents.create():
     - amount in cents
     - metadata: { orderId:'pending', productId, buyerId, sellerId, type:'marketplace_order' }
     - automatic_payment_methods: enabled
  6. $transaction:
     a. Atomic stock decrement: product.updateMany WHERE stock >= qty
     b. Order.create: status=PENDING, stripePaymentId=PI.id
  7. On transaction failure: cancel the PaymentIntent (cleanup)
  8. Update PI metadata with real orderId (non-critical, best-effort)
  9. Notify seller (fire-and-forget notification)
  10. Return { order, clientSecret }

Mobile confirms payment with Stripe SDK using clientSecret

*** WEBHOOK GAP: payment_intent.succeeded handler only processes tips ***
*** marketplace_order PaymentIntents are NOT handled by webhook ***
*** Order stays in PENDING status forever after payment succeeds ***
*** Seller must manually transition PENDING → PAID → SHIPPED ***

Order status transitions (via seller REST endpoint):
  POST /api/v1/commerce/orders/:id/status { status }
  Valid transitions:
    PENDING → PAID | CANCELLED
    PAID → SHIPPED | REFUNDED
    SHIPPED → DELIVERED
  On CANCELLED/REFUNDED: stock restored, salesCount decremented
  Buyer notified on each transition
```

---

### 1.5 Flow: Subscriptions (Membership Tiers)

```
┌─ Tier Creation (Creator) ──────────────────────────────────────┐
│ POST /api/v1/monetization/tiers                                │
│ MonetizationService.createTier():                              │
│   { name, price [$0.50-$10K], benefits[], level: bronze-plat } │
│   → MembershipTier record (no Stripe product yet)             │
└────────────────────────────────────────────────────────────────┘

Two subscribe paths exist:

┌─ Path A: MonetizationService (no Stripe) ──────────────────────┐
│ POST /api/v1/monetization/subscribe/:tierId                    │
│   1. Verify tier active, not own tier                          │
│   2. Check existing: if active+expired → mark expired          │
│   3. Upsert MembershipSubscription: status='pending'           │
│      endDate = now + 30 days                                   │
│   *** No payment collected, no Stripe integration ***          │
│   *** Status stays 'pending' forever ***                       │
└────────────────────────────────────────────────────────────────┘

┌─ Path B: PaymentsService (Stripe-integrated) ─────────────────┐
│ POST /api/v1/payments/create-subscription                      │
│   Body: { tierId, paymentMethodId }                            │
│                                                                │
│ PaymentsService.createSubscription():                          │
│   1. Verify tier active, not own tier                          │
│   2. getOrCreateStripeCustomer(userId)                         │
│   3. Attach paymentMethod to customer                          │
│   4. stripe.products.create (one per tier, duplicated!)        │
│   5. stripe.subscriptions.create:                              │
│      - price_data: tier.price/month recurring                  │
│      - metadata: { tierId, userId }                            │
│      - expand: latest_invoice.payment_intent                   │
│   6. Create/update MembershipSubscription: status='pending'    │
│   7. storeSubscriptionMapping (Redis, 1-year TTL, both dirs)   │
│   8. Return { subscriptionId, status, clientSecret, periodEnd }│
│                                                                │
│ Webhook: invoice.paid                                          │
│   handleInvoicePaid():                                         │
│     1. Lookup dbSubscriptionId via Redis/metadata fallback     │
│     2. Retrieve Stripe subscription for current_period_end     │
│     3. Update: status='active', endDate=period_end             │
│                                                                │
│ Webhook: customer.subscription.updated                         │
│   handleSubscriptionUpdated():                                 │
│     1. Map Stripe status → internal:                           │
│        active→active, past_due→past_due, canceled→cancelled,   │
│        unpaid→past_due, paused→paused                          │
│     2. Update endDate from current_period_end                  │
│                                                                │
│ Webhook: customer.subscription.deleted                         │
│   handleSubscriptionDeleted():                                 │
│     1. Update: status='cancelled', endDate=now                 │
│     2. Clean up both Redis direction mappings                  │
│                                                                │
│ Webhook: invoice.payment_failed                                │
│   handleInvoicePaymentFailed():                                │
│     1. Update: status='past_due'                               │
│     *** No DB fallback if Redis mapping expired ***             │
│                                                                │
│ Cancel: DELETE /api/v1/payments/cancel-subscription             │
│   1. Resolve subscriptionId (sub_ prefix → Stripe, else local) │
│   2. stripe.subscriptions.cancel()                             │
│   3. Update: status='cancelled', endDate=now                   │
│   4. Clean up Redis mappings                                   │
└────────────────────────────────────────────────────────────────┘
```

**Subscription bugs:**
- Path A creates a subscription with no payment — stays `pending` forever
- Path B creates a new Stripe Product on EVERY subscription (no dedup)
- `handleInvoicePaymentFailed` has no DB fallback (unlike the other 3 handlers)

---

### 1.6 Flow: Donations (Zakat + Waqf)

```
Zakat Donation:
  POST /api/v1/commerce/zakat/funds/:id/donate
  Body: { amount, isAnonymous? }

  CommerceService.donateZakat():
    1. Validate amount > 0, <= 1M
    2. Verify fund exists + status='active'
    3. Prevent self-donation (fund.recipientId === userId)
    4. Create ZakatDonation: { fundId, donorId, amount, isAnonymous }
    *** No payment collected — donation record only ***
    *** Fund.raisedAmount NOT updated ***
    *** Comment in code: "should only be updated after payment confirmed" ***

Waqf Contribution:
  POST /api/v1/commerce/waqf/funds/:id/contribute
  Body: { amount }

  CommerceService.contributeWaqf():
    1. Validate amount > 0, <= 1M
    2. Verify fund active
    3. Prevent self-contribution
    4. $transaction:
       a. Re-check fund active (atomic)
       b. WaqfFund.update: raisedAmount += amount
       c. Auto-complete: if raisedAmount >= goalAmount → isActive=false
    5. Return { success, raisedAmount }
    *** INCONSISTENCY: waqf updates raisedAmount immediately ***
    *** but zakat doesn't (wants webhook first) ***
    *** Neither collects actual payment ***

Note: The CLAUDE.md stated "Waqf contribution endpoint MISSING" but
POST /commerce/waqf/funds/:id/contribute EXISTS in commerce.controller.ts
line 193. The endpoint works — it just doesn't collect payment.
```

---

### 1.7 Flow: Premium Subscription

```
POST /api/v1/commerce/premium/subscribe
  Body: { plan: 'monthly' | 'yearly' }

  CommerceService.subscribePremium():
    1. Check no existing active subscription
    2. endDate = now + 1 month (or 12 months for yearly)
    3. Upsert PremiumSubscription: status=ACTIVE, plan, endDate
    *** Status set to ACTIVE immediately with no payment ***
    *** Comment: "should be activated via payment webhook" ***
    *** But no webhook handler for premium subscriptions ***
```

---

### 1.8 Webhook Summary — What's Handled vs Missing

```
Stripe Webhook Endpoint: POST /api/v1/payments/webhooks/stripe

HANDLED EVENTS:
  payment_intent.succeeded     → Updates Tip status to 'completed'
  payment_intent.payment_failed → Updates Tip status to 'failed'
  invoice.paid                 → Activates MembershipSubscription
  invoice.payment_failed       → Marks subscription 'past_due'
  customer.subscription.updated → Syncs subscription status/dates
  customer.subscription.deleted → Cancels subscription
  charge.dispute.created       → Marks Tip as 'disputed'
  payment_method.attached      → Log only

MISSING HANDLERS (CRITICAL):
  ✗ Coin purchase PaymentIntent (type:'coin_purchase') → coins never credited
  ✗ Marketplace order PaymentIntent (type:'marketplace_order') → order stays PENDING
  ✗ Zakat donation payment confirmation → raisedAmount never updated
  ✗ Waqf payment confirmation → money taken immediately with no payment
  ✗ Premium subscription payment → activated immediately with no payment
  ✗ payment_intent.canceled → stale pending records accumulate

IDEMPOTENCY: Redis-based event dedup with 7-day TTL (good)
SIGNATURE: Stripe webhook signature verification (good)
RESILIENCE: Redis→DB fallback for mapping lookups (good, except invoice.payment_failed)
```

---

## PART 2: WEBRTC CALL FLOW

### 2.1 Data Models

```
Prisma Enum:
  CallType { VOICE, VIDEO }     ← uppercase, used by REST DTO + DB
  CallStatus { RINGING, ACTIVE, ENDED, DECLINED, MISSED }

Mobile types:
  callType: 'voice' | 'video'  ← lowercase, used by useWebRTC + call screen
  callsApi.initiate(): { receiverId, callType: 'voice'|'video' }

Socket DTO:
  WsCallInitiateDto.callType: @IsIn(['AUDIO', 'VIDEO'])  ← 'AUDIO' not 'VOICE'!
```

### 2.2 Complete Call Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│  CALLER (Device A)                SERVER               CALLEE (Device B) │
│                                                                  │
│  Step 1: REST — Create Call Session                              │
│  ─────────────────────────────────                               │
│  POST /calls                                                     │
│  Body: { targetUserId, callType: 'VOICE'|'VIDEO' }              │
│  → CallsService.initiate():                                      │
│    1. Self-call check                                            │
│    2. Bidirectional block check                                  │
│    3. Active call check (both users)                             │
│    4. CallSession.create:                                        │
│       status=RINGING, callType=VOICE|VIDEO                       │
│       participants: [                                            │
│         { userId:caller, role:'caller', joinedAt:now },          │
│         { userId:callee, role:'callee', joinedAt:null }          │
│       ]                                                          │
│    5. Return session with participant user details                │
│                                                                  │
│  Step 2: Navigate to Call Screen                                 │
│  ────────────────────────────────                                │
│  router.push(`/call/${session.id}`)                              │
│  call/[id].tsx mounts:                                           │
│    - Fetches Call via GET /calls/:id                             │
│    - Fetches ICE servers via GET /calls/ice-servers              │
│    - Connects Socket.io to /chat namespace with JWT              │
│    - Instantiates useWebRTC:                                     │
│      { socketRef, socketReady, targetUserId, callType:'voice',   │
│        iceServers, isInitiator:true, onConnected, onFailed }     │
│                                                                  │
│  *** BUG: callType sent to REST is 'VOICE'/'VIDEO' (Prisma enum)│
│  *** but useWebRTC receives 'voice'/'video' (lowercase)         │
│  *** callsApi.initiate sends lowercase to REST endpoint         │
│  *** BUT InitiateCallDto uses @IsEnum(CallType) which expects   │
│  *** 'VOICE'/'VIDEO' → mobile sends wrong case                  │
│                                                                  │
│  Step 3: Socket — Notify Callee (MISSING FROM MOBILE)           │
│  ─────────────────────────────────────────────────────           │
│  EXPECTED: socket.emit('call_initiate', {                        │
│    targetUserId, callType, sessionId                             │
│  })                                                              │
│  Server @SubscribeMessage('call_initiate'):                      │
│    1. Rate limit: 3/minute                                       │
│    2. Validate DTO (targetUserId UUID, callType in AUDIO|VIDEO,  │
│       sessionId UUID)                                            │
│    3. Block check                                                │
│    4. getUserSockets(targetUserId) from Redis presence           │
│    5. Emit to all callee sockets: 'incoming_call'                │
│       { sessionId, callType, callerId }                          │
│                                                                  │
│  *** MISSING EMIT #1: Mobile NEVER emits 'call_initiate' ***    │
│  *** call/[id].tsx has no socket.emit('call_initiate',...) ***   │
│  *** Callee never receives 'incoming_call' event ***             │
│  *** Call rings on caller's screen but callee sees nothing ***   │
│                                                                  │
│  Step 4: WebRTC — Caller Creates Offer                          │
│  ──────────────────────────────────────                          │
│  useWebRTC.start() triggers when:                                │
│    !isIncomingCall && callStatus==='ringing' && socketReady      │
│                                                                  │
│  start():                                                        │
│    1. Guard: pcRef.current || startingRef.current → skip         │
│    2. Guard: socket not connected → skip                         │
│    3. mediaDevices.getUserMedia({ audio:true, video:facing })    │
│    4. Guard: !mountedRef.current → release stream + return       │
│    5. Create RTCPeerConnection({ iceServers })                   │
│    6. Add local tracks: stream.getTracks().forEach(addTrack)     │
│    7. Create remote MediaStream (Pattern B — manual assembly)    │
│    8. pc.ontrack = (event) → remote.addTrack(track)             │
│    9. pc.onicecandidate = → emit('call_signal',{target,signal})  │
│   10. pc.onconnectionstatechange = → update state + callbacks    │
│   11. If isInitiator:                                            │
│       a. pc.createOffer({ offerToReceiveAudio/Video })           │
│       b. pc.setLocalDescription(offer)                           │
│       c. socket.emit('call_signal', { targetUserId,              │
│            signal: { type:'offer', sdp: offer } })               │
│                                                                  │
│  Step 5: Socket — Relay Offer to Callee                         │
│  ──────────────────────────────────────                          │
│  Server @SubscribeMessage('call_signal'):                        │
│    1. Rate limit: 60 signals per 10 seconds                     │
│    2. Payload size check: max 64KB                               │
│    3. Block check (prevents WebRTC IP leak)                      │
│    4. getUserSockets(targetUserId) → emit 'call_signal'          │
│       { fromUserId, signal }                                     │
│                                                                  │
│  Step 6: Callee Answers (REST + Socket)                         │
│  ──────────────────────────────────────                          │
│  Callee UI: handleAnswer()                                       │
│    1. answerMutation: POST /calls/:id/answer                     │
│       CallsService.answer():                                     │
│         a. Verify participant + status=RINGING                   │
│         b. Update: status=ACTIVE, startedAt=now                  │
│         c. Update participant: joinedAt=now                      │
│    2. webrtc.start() — creates PC + gets media (non-initiator)   │
│                                                                  │
│  *** MISSING EMIT #2: Mobile NEVER emits 'call_answer' ***      │
│  *** The server has @SubscribeMessage('call_answer')     ***     │
│  *** which would emit 'call_answered' to caller          ***     │
│  *** call/[id].tsx listens for 'call_answered' (line 152)***     │
│  *** but no code emits 'call_answer' to trigger it       ***     │
│  *** The REST answer updates DB but doesn't notify caller ***    │
│                                                                  │
│  Step 7: Callee Handles Offer → Creates Answer                  │
│  ─────────────────────────────────────────────                   │
│  useWebRTC socket.on('call_signal') handler:                     │
│    if signal.type === 'offer':                                   │
│      1. pc.setRemoteDescription(offer)                           │
│      2. hasRemoteDescRef = true                                  │
│      3. Drain ICE candidate queue                                │
│      4. pc.createAnswer()                                        │
│      5. pc.setLocalDescription(answer)                           │
│      6. socket.emit('call_signal', { targetUserId,               │
│           signal: { type:'answer', sdp: answer } })              │
│                                                                  │
│  Step 8: Caller Handles Answer                                   │
│  ─────────────────────────────                                   │
│    if signal.type === 'answer':                                  │
│      1. pc.setRemoteDescription(answer)                          │
│      2. hasRemoteDescRef = true                                  │
│      3. Drain ICE candidate queue                                │
│                                                                  │
│  Step 9: ICE Candidate Exchange (bidirectional trickle)          │
│  ──────────────────────────────────────────────────────          │
│  pc.onicecandidate fires → emit('call_signal',                   │
│    { targetUserId, signal: { type:'ice-candidate', candidate } })│
│                                                                  │
│  Receiving side: socket.on('call_signal')                        │
│    if signal.type === 'ice-candidate':                           │
│      - If hasRemoteDescRef → pc.addIceCandidate(candidate)      │
│      - Else → queue (max 200 candidates)                        │
│                                                                  │
│  Step 10: Connection Established                                 │
│  ────────────────────────────                                    │
│  pc.onconnectionstatechange → 'connected'                        │
│    → setConnectionState('connected')                             │
│    → onConnectedRef.current() → setCallStatus('connected')      │
│    → Duration timer starts (1s interval)                         │
│    → Video RTCViews render (if video call):                      │
│      Remote: full preview area                                   │
│      Local: PiP (100x140) top-right with mirror for front cam   │
│                                                                  │
│  Step 11: Media Controls (during call)                           │
│  ─────────────────────────────────────                           │
│  toggleMute: audioTrack.enabled = !enabled                       │
│  toggleVideo: videoTrack.enabled = !enabled                      │
│  flipCamera: videoTrack.applyConstraints({ facingMode })         │
│    Fallback: videoTrack._switchCamera() (deprecated API)         │
│  toggleSpeaker: local state only (needs InCallManager package)   │
│                                                                  │
│  Step 12: Hangup                                                 │
│  ───────────                                                     │
│  handleEndCall():                                                │
│    1. webrtc.hangup():                                           │
│       a. Null all event handlers (prevent setState after close)  │
│       b. pc.close()                                              │
│       c. releaseStream() → tracks.stop() + stream.release()     │
│       d. Reset all state + refs                                  │
│    2. endCallMutation: POST /calls/:id/end                       │
│       CallsService.end():                                        │
│         a. Verify participant + RINGING|ACTIVE                   │
│         b. Calculate duration from startedAt                     │
│         c. Mark all participants leftAt=now                      │
│         d. Update: status=ENDED, endedAt, duration               │
│                                                                  │
│  *** MISSING EMIT #3: Mobile NEVER emits 'call_end' ***         │
│  *** Server @SubscribeMessage('call_end') would emit    ***     │
│  *** 'call_ended' to all participants                   ***     │
│  *** call/[id].tsx listens for 'call_ended' (line 155)  ***     │
│  *** but no code emits 'call_end' to trigger it         ***     │
│  *** Other party is NOT notified of hangup via socket    ***     │
│  *** (pc.onconnectionstatechange may fire 'disconnected')***     │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 ICE Server Configuration

```
GET /api/v1/calls/ice-servers
CallsService.getIceServers():
  Always includes:
    stun:stun.l.google.com:19302
    stun:stun1.l.google.com:19302
    stun:stun.cloudflare.com:3478
  If TURN_SERVER_URL + TURN_USERNAME + TURN_CREDENTIAL set:
    Adds TURN server entry

  All 3 TURN env vars ARE configured in Railway (per CLAUDE.md).
```

### 2.4 Socket Events Map (Call-related)

```
CLIENT → SERVER:
  call_initiate  → { targetUserId:UUID, callType:'AUDIO'|'VIDEO', sessionId:UUID }
  call_answer    → { sessionId:UUID, callerId:UUID }
  call_reject    → { sessionId:UUID, callerId:UUID }
  call_end       → { sessionId:UUID, participants:string[] }
  call_signal    → { targetUserId:UUID, signal:any (max 64KB) }

SERVER → CLIENT:
  incoming_call  → { sessionId, callType, callerId }
  call_answered  → { sessionId, answeredBy }
  call_rejected  → { sessionId, rejectedBy }
  call_ended     → { sessionId, endedBy }
  call_signal    → { fromUserId, signal }

All call socket handlers include:
  - Auth check (client.data.userId)
  - Rate limiting (3/min for initiate, 10/min for answer/reject/end, 60/10s for signal)
  - DTO validation via class-validator
  - Bidirectional block checks (call_initiate, call_answer, call_reject, call_signal)
  - Target user socket lookup via Redis presence
```

### 2.5 Critical Bugs Summary

| # | Bug | Impact | Location |
|---|-----|--------|----------|
| 1 | **call_initiate never emitted from mobile** | Callee never sees incoming call. Call only exists in DB. | `call/[id].tsx` — no `socket.emit('call_initiate',...)` anywhere |
| 2 | **call_answer never emitted from mobile** | Caller not notified when callee answers via REST. WebRTC may still connect via signal relay, but UI stays "Calling..." | `call/[id].tsx` — `handleAnswer()` does REST POST only |
| 3 | **call_end never emitted from mobile** | Other party not notified of hangup via socket. PC disconnection may trigger `onconnectionstatechange` but no clean signal. | `call/[id].tsx` — `handleEndCall()` does REST POST + local hangup only |
| 4 | **CallType enum mismatch** | Socket DTO validates `'AUDIO'\|'VIDEO'` but Prisma enum is `VOICE\|VIDEO`. REST DTO uses `@IsEnum(CallType)` = `VOICE\|VIDEO`. Mobile sends lowercase `'voice'\|'video'` to REST. | `WsCallInitiateDto` line 25: `@IsIn(['AUDIO', 'VIDEO'])` vs Prisma `enum CallType { VOICE, VIDEO }` |
| 5 | **callsApi.initiate sends wrong case** | `callsApi.initiate({ callType: 'voice' })` but `InitiateCallDto` uses `@IsEnum(CallType)` expecting `'VOICE'` → validation fails | `api.ts` line 1122 vs `initiate-call.dto.ts` line 11 |
| 6 | **Speaker toggle is cosmetic** | `setIsSpeakerOn` toggles local state only. No `react-native-incall-manager` package installed to route audio to speaker. | `call/[id].tsx` line 215 |
| 7 | **getHistory URL malformed** | `callsApi.getHistory` uses backtick `\calls\history` with backslashes instead of forward slashes | `api.ts` line 1131 |

### 2.6 What Would Make Calls Work End-to-End

```
Minimum fixes required:
1. Fix callsApi.initiate to send callType: 'VOICE' (uppercase) or
   change InitiateCallDto to accept lowercase
2. After REST POST /calls (initiate), emit 'call_initiate' via socket:
     socket.emit('call_initiate', {
       targetUserId: callee.id,
       callType: 'VOICE' or 'VIDEO',  // must match DTO validation
       sessionId: session.id
     })
3. After REST POST /calls/:id/answer, emit 'call_answer' via socket:
     socket.emit('call_answer', {
       sessionId: call.id,
       callerId: call.callerId
     })
4. After REST POST /calls/:id/end, emit 'call_end' via socket:
     socket.emit('call_end', {
       sessionId: call.id,
       participants: [call.callerId, call.calleeId]
     })
5. Fix WsCallInitiateDto: @IsIn(['VOICE', 'VIDEO']) to match Prisma enum
6. Fix callsApi.getHistory URL (backslashes → forward slashes)
7. Install react-native-incall-manager for speaker routing
```

---

## PART 3: CROSS-CUTTING CONCERNS

### 3.1 Stripe Configuration

Both `PaymentsService` and `CommerceService` independently construct their own `Stripe` instances from `STRIPE_SECRET_KEY`. They use the same API version `'2025-02-24.acacia'`. Both have `ensureStripeAvailable()` guards but soft-fail at construction (log warning, allow service to start).

### 3.2 Redis Usage in Payments

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `user:customer:{userId}` | 30 days | Stripe customer ID cache |
| `payment_intent:{PI.id}` | 30 days | Maps PI → Tip ID |
| `subscription:{stripeSub}` | 1 year | Maps Stripe sub → DB sub ID |
| `subscription:internal:{dbSub}` | 1 year | Reverse mapping (DB → Stripe) |
| `stripe_webhook:{eventId}` | 7 days | Idempotency dedup |

### 3.3 Race Condition Protection

All balance mutations use the **conditional updateMany** pattern:
```
updateMany({
  where: { userId, balance: { gte: amount } },
  data: { balance: { decrement: amount } }
})
// Returns count=0 if insufficient → throw BadRequest
```

This is correct and prevents negative balances under concurrent requests.

### 3.4 Redis Mapping Resilience

The payment webhook handlers implement a 2-tier lookup:
1. Redis `payment_intent:{id}` or `subscription:{id}`
2. If Redis miss → DB fallback using metadata fields (senderId, tierId, userId)
3. If both fail → log warning and skip

Exception: `handleInvoicePaymentFailed` only checks Redis, no DB fallback.
