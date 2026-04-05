# X16: Webhook Idempotency — Hostile Audit

**Date:** 2026-04-05
**Auditor:** Opus 4.6 (1M context)
**Scope:** All inbound webhook handlers — Stripe, Clerk, Cloudflare Stream, LiveKit, Internal (E2E, Push)
**Verdict:** MOSTLY GOOD with 8 findings — Stripe is gold standard, Clerk has race windows, Stream has zero dedup, internal endpoints have no dedup

---

## Webhook Handler Inventory

| Handler | File | Signature Verification | Dedup Mechanism | Verdict |
|---------|------|----------------------|-----------------|---------|
| **Stripe** | `stripe-webhook.controller.ts` | Stripe SDK (`constructEvent`) | Redis SET NX + DB `ProcessedWebhookEvent` (dual-layer) | **EXCELLENT** |
| **Clerk** | `webhooks.controller.ts` | Svix SDK (`wh.verify()`) | Redis GET/SETEX on `svix-id` (single-layer) | **GOOD with gaps** |
| **Cloudflare Stream** | `stream.controller.ts` | HMAC-SHA256 + timingSafeEqual + replay protection | **NONE** | **BAD** |
| **LiveKit** | `handler.go` (Go server) | LiveKit SDK (`webhook.ReceiveWebhookEvent`) | Redis SET NX (5-min TTL) | **GOOD** |
| **Internal E2E** | `internal-e2e.controller.ts` | HMAC-SHA256 + timingSafeEqual | **NONE** | **ACCEPTABLE** (idempotent ops) |
| **Internal Push** | `internal-push.controller.ts` | Timing-safe key comparison | **NONE** | **BAD** (push is not idempotent) |
| **Community Webhooks** | `webhooks.controller.ts` + `webhooks.service.ts` | Outbound (Mizanly sends, not receives) | N/A | N/A |

---

## Finding Index

| # | Severity | Handler | Finding |
|---|----------|---------|---------|
| X16-01 | **HIGH** | Clerk | Check-then-act race: Redis GET + side effects + Redis SETEX are not atomic |
| X16-02 | **HIGH** | Stream | Zero dedup — replay attack can trigger duplicate video state transitions |
| X16-03 | **HIGH** | Internal Push | No dedup — retry/replay sends duplicate push notifications |
| X16-04 | **MEDIUM** | Clerk | Redis-only dedup — no DB fallback. Redis flush = lost dedup state |
| X16-05 | **MEDIUM** | Clerk | 24h TTL — Clerk retries for up to 3 days. Events after TTL expiry bypass dedup |
| X16-06 | **MEDIUM** | Stream | No replay protection timestamp validation width limit |
| X16-07 | **MEDIUM** | LiveKit | 5-minute dedup TTL — LiveKit may retry beyond 5 minutes |
| X16-08 | **LOW** | Internal E2E | No dedup, but `createMany` for SYSTEM messages produces duplicates on retry |

---

## Detailed Findings

### X16-01: Clerk Webhook — Check-Then-Act Race [HIGH]

**File:** `apps/api/src/modules/auth/webhooks.controller.ts:105-171`

```
Sequence:
1. Redis GET clerk_webhook:{svixId}     → null (not processed)
2. Execute side effects (syncClerkUser)
3. Redis SETEX clerk_webhook:{svixId}   → mark processed
```

**Race:** If Clerk sends the same event twice in rapid succession (network retry before NestJS responds):
- Request A: GET → null → starts syncClerkUser
- Request B: GET → null (A hasn't set the key yet) → starts syncClerkUser
- Both execute the handler. Both set the key. User gets synced twice.

**Impact for `user.created`:** `authService.syncClerkUser()` calls `prisma.user.upsert` — this IS idempotent due to upsert semantics. The race causes an extra DB write but no data corruption.

**Impact for `session.revoked`:** Publishes `user:session_revoked` to Redis twice — the WebSocket handler may disconnect the user twice (benign).

**Impact for `user.deleted`:** `deactivateByClerkId()` could run twice — if it toggles state (not idempotent), this is dangerous. If it's a set-to-deactivated operation, it's safe.

**The Stripe handler avoids this race entirely:** it uses `Redis SET NX` (atomic claim) before executing any side effects. The Clerk handler uses `GET` then `SETEX` which is a classic TOCTOU bug.

**Fix:** Change to `SET NX` pattern like Stripe:
```typescript
const claimed = await this.redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
if (!claimed) return { received: true, deduplicated: true };
```

### X16-02: Cloudflare Stream Webhook — Zero Dedup [HIGH]

**File:** `apps/api/src/modules/stream/stream.controller.ts:36-78`

The Stream webhook handler has:
- Signature verification (HMAC-SHA256, good)
- Replay protection (reject signatures > 5 minutes old, good)
- **Zero deduplication** (bad)

If Cloudflare retries a `readyToStream: true` event:
1. `handleStreamReady(streamId)` runs again
2. Video gets updated to `status: PUBLISHED` again (idempotent? depends on `previousStatus`)
3. If `previousStatus` was `DRAFT` on first call, the second call sees `PUBLISHED` — the `videosCount` increment does NOT fire again (safe)
4. But `publishWorkflow.onPublish()` fires again — search re-indexing (benign but wasteful)

If Cloudflare retries a `status.state === 'error'` event:
1. `handleStreamError(streamId)` runs again
2. Video status set to `DRAFT` again (idempotent)
3. **BUT:** the `videosCount` decrement runs again:
```typescript
if (video.status !== 'DRAFT' && video.channelId) {
  await this.prisma.$executeRaw`
    UPDATE "channels"
    SET "videosCount" = GREATEST("videosCount" - 1, 0)
    WHERE id = ${video.channelId}
  `;
}
```
On the first call, `video.status` is `PUBLISHED`, so decrement fires.
On retry, `video.status` is now `DRAFT` (from first call), so decrement does NOT fire.
**This is actually safe** — the `GREATEST(..., 0)` clamp prevents negatives, and the second call sees `DRAFT` so it skips.

**However**, there is NO protection against Cloudflare Stream webhook replay attacks outside the 5-minute window. An attacker who captures a valid signed webhook can replay it after 5 minutes expires — the signature will be rejected by the timestamp check. But within the 5-minute window, the attacker can replay the same event multiple times.

**Fix:** Add Redis SET NX dedup keyed on `{streamId}:{readyToStream/error}` or on the webhook signature itself.

### X16-03: Internal Push — No Dedup, Push Is Not Idempotent [HIGH]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts:58-99`

The Go livekit-server calls this endpoint to send push notifications for incoming calls. If the Go server retries (network timeout, 500 response), the NestJS endpoint sends duplicate push notifications.

Push notifications are inherently NOT idempotent — each delivery creates a visible notification on the user's device. A retry means the user sees "Incoming call from Alice" twice.

**Impact:** User confusion. On iOS, multiple VoIP push notifications could trigger multiple CallKit incoming call UIs.

**Fix:** Add a dedup key (`sessionId + userId` or a client-supplied idempotency key) with Redis SET NX. The Go caller should send a unique request ID.

### X16-04: Clerk — Redis-Only Dedup, No DB Fallback [MEDIUM]

**File:** `apps/api/src/modules/auth/webhooks.controller.ts:108-116`

Stripe webhook handler has dual-layer dedup:
1. Redis SET NX (fast, atomic)
2. DB `ProcessedWebhookEvent` table (durable, survives Redis flush)

Clerk webhook handler has single-layer:
1. Redis GET/SETEX only

**If Redis is flushed** (maintenance, crash, Upstash issue), all Clerk dedup state is lost. If Clerk retries any events during the flush window, they will be re-processed.

**Impact:** `user.created` re-processes (safe — upsert). `user.deleted` re-processes (dangerous if `deactivateByClerkId` has side effects like data deletion).

**Fix:** Add DB-backed dedup like Stripe. Use the existing `ProcessedWebhookEvent` model.

### X16-05: Clerk — 24h TTL vs Clerk's 3-Day Retry [MEDIUM]

**File:** `apps/api/src/modules/auth/webhooks.controller.ts:169-171`
```typescript
if (dedupeKey) {
  await this.redis.setex(dedupeKey, 86400, '1'); // 24 hours
}
```

Comment on line 169 says: "24-hour TTL — Clerk retries for up to 3 days."

If an event fails on the first attempt (Redis claim set), then Redis flushes after 24 hours, Clerk retries on day 2 — the dedup key is gone. The event processes again.

**Fix:** Set TTL to 259200 (3 days) to cover the full Clerk retry window, or use DB-backed dedup.

### X16-06: Stream Webhook — Replay Within 5-Minute Window [MEDIUM]

**File:** `apps/api/src/modules/stream/stream.controller.ts:92-95`
```typescript
const signatureAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
if (isNaN(signatureAge) || signatureAge > 300) {
  throw new UnauthorizedException('Webhook signature expired');
}
```

**Issue:** `Math.abs()` allows signatures FROM THE FUTURE. A signature with a timestamp 4 minutes in the future is accepted. This is not exploitable unless the attacker can manipulate the server's clock, but it's a defense-in-depth concern.

More importantly: within the valid 5-minute window, the same signed payload can be replayed unlimited times because there is no nonce/event-ID tracking.

### X16-07: LiveKit — 5-Minute Dedup TTL [MEDIUM]

**File:** `apps/livekit-server/internal/handler/handler.go:47,893-902`
```go
webhookDedupTTL = 5 * time.Minute
// ...
dedupKey := fmt.Sprintf("lk:webhook:%s", eventID)
set, err := h.rdb.SetNX(ctx, dedupKey, "1", webhookDedupTTL).Result()
```

LiveKit Cloud may retry webhooks for longer than 5 minutes (their docs say up to 24 hours with exponential backoff). After the 5-minute TTL expires, a retried event will be processed again.

**Impact:** 
- `room_finished` processed twice: `EndCallSession` called twice (second call likely no-ops since status is already `ENDED`, but the duration update and missed call push fire again)
- `participant_joined` twice: `MarkParticipantLivekitJoined` is idempotent (DB update). `UpdateSessionStatus` to `ACTIVE` also idempotent.
- `egress_ended` twice: `UpdateSessionRecordingURL` is idempotent (overwrites same value).

**Most webhook events are naturally idempotent in the handler**, but `sendMissedCallPush` (goroutine) would fire again — duplicate missed call notification.

**Fix:** Increase TTL to 24 hours (86400 seconds). The Redis memory cost is negligible.

### X16-08: Internal E2E — No Dedup, Creates Duplicate SYSTEM Messages [LOW]

**File:** `apps/api/src/modules/messages/internal-e2e.controller.ts:86-105`

If the Go E2E server retries the identity-changed webhook:
```typescript
const messages = await this.prisma.message.createMany({
  data: conversationIds.map((convId) => ({
    conversationId: convId,
    messageType: MessageType.SYSTEM,
    content: 'SYSTEM:IDENTITY_CHANGED',
    isEncrypted: false,
  })),
});
```

Each retry creates another set of SYSTEM messages. Users see "[Security code changed]" appear multiple times.

**Impact:** Confusing but not dangerous. Users may think the identity changed multiple times.

**Fix:** Accept an idempotency key from the Go server (e.g., the identity key fingerprint + timestamp), check Redis before creating messages.

---

## Handler-by-Handler Assessment

### Stripe Webhook [EXCELLENT]

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`

**Strengths:**
- Signature verification via Stripe SDK `constructEvent()`
- Atomic Redis SET NX claim BEFORE any side effects
- DB fallback via `ProcessedWebhookEvent` table (survives Redis flush)
- 48h TTL on Redis claim (exceeds Stripe's retry window)
- Deterministic error detection — returns 200 to stop retries on validation errors
- Non-deterministic error handling — releases Redis claim so retry can succeed
- Logs all events with structured event type + ID

**Weaknesses:**
- None found. This is the gold standard in this codebase.

### Clerk Webhook [GOOD WITH GAPS]

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`

**Strengths:**
- Svix SDK signature verification
- Redis-based dedup with svix-id
- Dedup key set AFTER side effects (intentional — prevents blocking retries on handler failure)
- Rate limited (50/minute)

**Weaknesses:**
- GET-then-SETEX race (X16-01)
- Redis-only dedup, no DB fallback (X16-04)
- 24h TTL vs 3-day retry window (X16-05)
- `user.deleted` handler idempotency not verified (depends on `deactivateByClerkId` implementation)

### Cloudflare Stream Webhook [NEEDS WORK]

**File:** `apps/api/src/modules/stream/stream.controller.ts`

**Strengths:**
- HMAC-SHA256 signature verification with raw body
- Replay protection (5-minute window)
- timingSafeEqual for constant-time comparison
- Rate limited (60/minute)

**Weaknesses:**
- Zero event deduplication (X16-02)
- Math.abs allows future timestamps (X16-06)
- No event ID tracking

### LiveKit Webhook [GOOD]

**File:** `apps/livekit-server/internal/handler/handler.go`

**Strengths:**
- LiveKit SDK signature verification
- Redis SET NX dedup (atomic, no race)
- All DB errors logged (never swallowed)
- Graceful handling of missing rooms/sessions

**Weaknesses:**
- 5-minute dedup TTL may be too short (X16-07)
- Dedup silently fails open if Redis is nil (`if h.rdb != nil` guard)
- Missed call push notification fires in goroutine — no dedup on push itself

### Internal E2E Webhook [ACCEPTABLE]

**File:** `apps/api/src/modules/messages/internal-e2e.controller.ts`

**Strengths:**
- HMAC-SHA256 with raw body
- timingSafeEqual
- Rate limited (5/minute)
- userId validated (length, type)

**Weaknesses:**
- No dedup — creates duplicate SYSTEM messages on retry (X16-08)
- Rate limit of 5/minute is correct for normal use but may be too strict if batch identity changes happen

### Internal Push Endpoint [NEEDS WORK]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts`

**Strengths:**
- Timing-safe key comparison
- Rate limited (30/minute)
- User count cap (100)
- Returns 500 on push failure (Go caller knows to retry)

**Weaknesses:**
- No dedup — duplicate pushes on retry (X16-03)
- The key comparison is NOT HMAC — it compares a raw shared secret. If the secret is short or predictable, timing-safe comparison alone is insufficient.

---

## Community Webhooks (Outbound — Not Audited for Idempotency)

**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`

This is Mizanly SENDING webhooks to external services, not receiving them. The outbound side has:
- SSRF protection (blocks localhost, internal, metadata.google.internal)
- HTTPS enforcement (rejects http://)
- HMAC-SHA256 signatures on outbound payloads
- Secret hashing (`plain:` prefix for stored secrets)

Not relevant to the inbound idempotency audit.

---

## Summary

| Handler | Sig Verification | Dedup | Race-Free | Retry-Safe | Grade |
|---------|-----------------|-------|-----------|------------|-------|
| Stripe | A+ | A+ (dual-layer) | A+ (SET NX) | A+ (releases claim on transient error) | **A+** |
| LiveKit | A+ | B (Redis only, short TTL) | A+ (SET NX) | B (5-min TTL) | **B+** |
| Clerk | A+ | C (Redis only, race) | D (GET-then-SETEX) | C (24h vs 3-day) | **C+** |
| Stream | A (with replay check) | F (none) | F (none) | F (retries re-process) | **D** |
| E2E Internal | A | F (none) | F (none) | D (duplicate messages) | **D+** |
| Push Internal | B (raw key, not HMAC) | F (none) | F (none) | F (duplicate pushes) | **D-** |

---

## Recommended Fixes (Priority Order)

1. **Clerk webhook:** Change `GET` + `SETEX` to `SET NX` (atomic claim). Add DB fallback. Extend TTL to 3 days.
2. **Stream webhook:** Add Redis SET NX dedup keyed on `{streamId}:{event_type}:{timestamp}`.
3. **Internal Push:** Add Redis SET NX dedup on a caller-supplied idempotency key (session ID + user ID).
4. **LiveKit webhook:** Increase dedup TTL from 5 minutes to 24 hours.
5. **Internal E2E:** Add dedup on identity key fingerprint to prevent duplicate SYSTEM messages.
6. **Internal Push auth:** Change from raw key comparison to HMAC verification (like E2E controller).
