# I02 — NestJS / Go Server Integration Audit

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** All cross-service communication paths between NestJS API, Go livekit-server, Go e2e-server, and Mobile clients.
**Method:** Static code analysis of handler code, route registration, config, middleware, mobile API clients, and wire-format types.

---

## Communication Paths Audited

| # | Path | Direction | Auth Mechanism |
|---|------|-----------|----------------|
| P1 | Go livekit-server -> NestJS `internal/push-to-users` | Server-to-server | `X-Internal-Key` header (shared secret) |
| P2 | Go e2e-server -> NestJS `internal/e2e/identity-changed` | Server-to-server | `X-Webhook-Signature` HMAC-SHA256 |
| P3 | Mobile -> Go e2e-server via `e2eApi.ts` | Client-to-server | Clerk JWT (`Authorization: Bearer`) |
| P4 | Mobile -> Go livekit-server via `livekit.ts` | Client-to-server | Clerk JWT (`Authorization: Bearer`) via `api.ts` |

---

## Findings

### I02-F01: deleteIngress route mismatch — Mobile sends POST to nonexistent path [CRITICAL]

**Mobile client** (`apps/mobile/src/services/livekit.ts:88-89`):
```typescript
deleteIngress: (ingressId: string, roomName: string): Promise<{ success: boolean }> =>
    api.post(`${LIVEKIT_BASE}/calls/ingress/${encodeURIComponent(ingressId)}/delete`, { roomName }),
```

**Go server route** (`apps/livekit-server/cmd/server/main.go:181`):
```go
mux.Handle("DELETE /api/v1/calls/ingress/{id}", ...)
```

**Go handler** (`handler.go:843-846`):
```go
func (h *Handler) HandleDeleteIngress(w http.ResponseWriter, r *http.Request) {
    ingressID := r.PathValue("id")
    roomName := r.URL.Query().Get("roomName")  // expects query param
```

Two distinct mismatches:
1. **HTTP method**: Mobile sends `POST` to `.../delete`, server expects `DELETE` on `.../{id}`. The mobile comment says "W12-C04#17: Use POST with body instead of query param on DELETE (some proxies strip DELETE query params)" -- but the Go server was never updated to match. The mobile request hits a **404** because `POST /api/v1/calls/ingress/{id}/delete` has no registered handler.
2. **roomName transport**: Mobile sends `roomName` in the JSON body, server reads it from `r.URL.Query().Get("roomName")` (query parameter). Even if the route matched, the handler would receive an empty `roomName` and return 400.

**Impact:** `deleteIngress` is completely broken. Calling it from mobile will always fail. This is dead code that has never been exercised.

---

### I02-F02: e2e-server notifyIdentityChanged retry loop has context leak on first attempt [MEDIUM]

**File:** `apps/e2e-server/internal/handler/handler.go:576-621`

The retry loop creates a 5s context for the outer scope (line 576-577), but the first iteration (the `attempt == 0` branch at line 609-619) uses this outer context directly and **never cancels it** before the loop potentially retries. If the first attempt succeeds, the deferred `cancel()` at line 577 handles it. But if the first attempt fails and the loop moves to `attempt > 0`, the outer context's 5s timeout is still ticking. The retry iterations at `attempt > 0` create their own contexts (lines 591-596) which is correct, but the outer `ctx` from line 576 leaks until the function returns.

More critically: the outer context timeout is only 5 seconds. If the first attempt takes 4 seconds and returns a 500, the retry at attempt 1 sleeps 1 second (1*1=1), then creates a new 5s context. But the function's overall latency is unbounded from the goroutine's perspective. This is not a security issue but a resource hygiene issue.

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
req = req.WithContext(ctx)
// ... retry loop uses different contexts for attempt > 0
// but the outer ctx remains allocated until function returns
```

**Impact:** Minor context leak. The deferred `cancel()` cleans up on function exit, so no goroutine leak. But the outer context is wasted on retry iterations since a new context is created for each retry.

---

### I02-F03: e2e-server webhook secret and URL are NOT validated at startup [HIGH]

**File:** `apps/e2e-server/internal/config/config.go:38-39`

```go
NestJSInternalURL:      os.Getenv("NESTJS_INTERNAL_URL"),
InternalWebhookSecret:  os.Getenv("INTERNAL_WEBHOOK_SECRET"),
```

These are read but **never validated as required**. The config `Load()` function validates `DatabaseURL`, `ClerkSecretKey`, `RedisURL` with explicit empty checks, but `NestJSInternalURL` and `InternalWebhookSecret` are allowed to be empty strings.

Compare to the livekit-server config (`apps/livekit-server/internal/config/config.go:92-94`):
```go
if cfg.InternalServiceKey == "" {
    return nil, errors.New("INTERNAL_SERVICE_KEY is required")
}
```

The livekit-server **does** validate its internal key. The e2e-server does not.

**Impact:** If `INTERNAL_WEBHOOK_SECRET` is not set in production, the e2e-server starts successfully but identity-change webhooks silently fail (handler logs a warning and returns without sending). The NestJS side also logs a warning at startup. But the user gets no SYSTEM message when their security code changes -- a silent security regression. This should fail loudly at startup like the livekit-server does.

---

### I02-F04: livekit-server internal push has no idempotency — duplicate pushes on retry [MEDIUM]

**File:** `apps/livekit-server/internal/handler/handler.go:1116-1156`

`postInternalPush` retries once on 5xx. If the first attempt's request reaches NestJS, NestJS processes the push, but the response is lost (network timeout after NestJS processes), the retry sends the **same push payload again**. There is no idempotency key.

```go
for attempt := 0; attempt < 2; attempt++ {
    // ... same bodyBytes every time, no idempotency header
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Internal-Key", h.cfg.InternalServiceKey)
    // no X-Idempotency-Key or request ID
```

The NestJS `InternalPushController` also has no deduplication -- it processes every request.

**Impact:** Users may receive duplicate "Incoming Call" or "Missed Call" push notifications. For incoming calls, this means the phone rings twice. Not a security issue but a UX degradation.

---

### I02-F05: e2e-server identity-changed webhook has no idempotency either [MEDIUM]

**File:** `apps/e2e-server/internal/handler/handler.go:582-621`

Same pattern as F04. The retry loop sends the same payload up to 3 times with no idempotency key. If the NestJS endpoint processes the first request and the response is lost, the retry creates **duplicate SYSTEM messages** ("Security code changed") in every conversation the user is in.

The NestJS `InternalE2EController.handleIdentityChanged` uses `prisma.message.createMany` with no deduplication check. Every successful webhook call creates N messages (one per conversation).

**Impact:** Users see duplicate "[Security code changed]" messages. Since this fires on identity key changes (reinstall, new device), it's low-frequency but high-visibility. Users may lose trust in the E2E security indicator if the same warning appears 2-3 times.

---

### I02-F06: NestJS internal push auth uses raw key comparison, not HMAC [LOW]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts:67-75`

The livekit-server -> NestJS push endpoint uses a **raw shared key** comparison:
```typescript
const keyBuf = Buffer.from(this.serviceKey, 'utf8');
const inputBuf = Buffer.from(internalKey, 'utf8');
if (keyBuf.length !== inputBuf.length || !timingSafeEqual(keyBuf, inputBuf)) {
```

The e2e-server -> NestJS identity webhook uses **HMAC-SHA256** of the request body:
```typescript
const expectedSig = createHmac('sha256', secret).update(rawBody).digest('hex');
```

The HMAC approach is strictly stronger because:
1. It binds the secret to the specific request body (prevents replay with modified body).
2. The secret never traverses the wire -- only the HMAC does.

The raw key approach means `INTERNAL_SERVICE_KEY` is sent in plaintext in the `X-Internal-Key` header on every request. If any logging middleware, proxy, or error handler captures request headers, the key is leaked.

Both use timing-safe comparison, which is good. But the inconsistency suggests the push endpoint was built earlier and never upgraded.

**Impact:** If the internal network is compromised (man-in-the-middle between Go and NestJS), the attacker captures the raw key and can send arbitrary push notifications to any user. With HMAC, they'd only be able to replay specific requests.

---

### I02-F07: Mobile e2eApi.ts ignores response body on errors (potential info loss) [LOW]

**File:** `apps/mobile/src/services/signal/e2eApi.ts:139-145`

```typescript
if (!response.ok) {
    throw new Error(`E2E request failed: ${response.status}`);
}
```

The error handler intentionally strips the response body (F9 fix comment). This is correct for security (prevents server internals from reaching Sentry). However, it means the mobile client **never knows why a request failed** beyond the HTTP status code.

For example, if `uploadOneTimePreKeys` returns 400 because `deviceId` is invalid, the mobile gets `Error: E2E request failed: 400` with no indication of which field was wrong. The Go server sends `{"error":"Bad Request","message":"deviceId must be between 1 and 10"}` but the client discards it.

**Impact:** Debugging integration issues in production will be harder. The developer must correlate mobile error logs (status code only) with Go server logs (full error message) by timestamp. No security impact.

---

### I02-F08: Mobile livekit.ts response unwrapping inconsistency [MEDIUM]

**File:** `apps/mobile/src/services/livekit.ts` + `apps/mobile/src/services/api.ts:334-338`

The `api.ts` client automatically unwraps the NestJS `TransformInterceptor` envelope:
```typescript
if (json.success && json.meta !== undefined) {
    return { data: json.data, meta: json.meta } as T;
}
return json.data !== undefined ? json.data : json;
```

But the Go livekit-server does NOT use the NestJS `TransformInterceptor`. It returns raw JSON:
```go
writeJSON(w, http.StatusCreated, map[string]interface{}{
    "data": session, "token": token, "room": room,
    "calleeIds": calleeIDs, "e2eeKey": e2eeKey, "e2eeSalt": e2eeSalt, "success": true,
})
```

The Go response manually includes `"data"` and `"success"` keys to mimic the NestJS envelope. But `api.ts` unwrapping logic checks `json.data !== undefined ? json.data : json`. This means for `createRoom`, the client receives `session` (the `data` value) instead of the full response with `token`, `e2eeKey`, etc.

Wait -- looking more carefully at the `CreateRoomResponse` type:
```typescript
interface CreateRoomResponse {
    data: { ... };
    token: string;
    room: { ... };
    calleeIds: string[];
    e2eeKey: string;
    e2eeSalt: string;
    success: boolean;
}
```

The `data` field is a sub-object AND there are top-level fields (`token`, `e2eeKey`). The `api.ts` unwrapper sees `json.data !== undefined` and returns `json.data` -- which is just the session object. The `token`, `e2eeKey`, `e2eeSalt`, `calleeIds`, and `room` fields are **stripped**.

However, the mobile code passes the full URL (`LIVEKIT_BASE` starts with `https://`), so `api.ts` line 256 detects `path.startsWith('http')` and uses the full URL directly. The unwrapping still happens on line 336 though.

**Impact:** This is potentially a **critical runtime bug**. If `api.ts` unwraps the response and strips `e2eeKey`, `token`, etc., the mobile `useLiveKitCall` hook would receive an incomplete response and the call would fail to connect or lack encryption. This needs runtime verification. The typing claims `createRoom` returns `CreateRoomResponse` which includes all fields, but the actual runtime value after `api.ts` unwrapping may be different.

**HOWEVER:** The fact that this code exists and passed 49 tests suggests either (a) the tests mock the response at a higher level and don't exercise `api.ts` unwrapping, or (b) the Go response format happens to survive unwrapping because the `data` field contains a nested object that also has the required fields. This needs runtime testing on a real device to confirm.

---

### I02-F09: e2e-server webhook retry: request body may be consumed on first attempt [LOW]

**File:** `apps/e2e-server/internal/handler/handler.go:582-618`

The first attempt (lines 609-618) uses the original `req` object. If `webhookClient.Do(req)` partially reads the body and fails, the body reader position is advanced. The retry at `attempt > 0` correctly creates a new `http.NewRequest` with `bytes.NewReader(body)`. But the first-to-second transition has a subtle issue:

At line 609, `h.webhookClient.Do(req)` is called with the original request whose body is `bytes.NewReader(body)`. After this call (whether success or failure), the reader position is at the end. The code at line 586 correctly creates a **new** request for retries. So this is actually fine. No issue.

**Impact:** None after closer review. The retry logic correctly recreates the request on each retry iteration.

*Retracted -- not a finding.*

---

### I02-F10: Mobile livekit.ts uses `api.delete` for deleteRoom but Go expects path param [INFO]

**File:** `apps/mobile/src/services/livekit.ts:46-47`

```typescript
deleteRoom: (roomId: string): Promise<{ success: boolean }> =>
    api.delete(`${LIVEKIT_BASE}/calls/rooms/${encodeURIComponent(roomId)}`),
```

**Go route:** `mux.Handle("DELETE /api/v1/calls/rooms/{id}", ...)`

This is correctly aligned. The mobile sends `DELETE /api/v1/calls/rooms/{roomId}` and Go 1.22+ `mux` extracts `{id}` from the path. The `encodeURIComponent` ensures special characters in room names are safely encoded.

**Impact:** None. Correct implementation.

*Not a finding -- verified correct.*

---

### I02-F11: e2e-server notifyIdentityChanged runs in fire-and-forget goroutine with no shutdown coordination [MEDIUM]

**File:** `apps/e2e-server/internal/handler/handler.go:128`
```go
if changed {
    go h.notifyIdentityChanged(userID, oldFP, req.PublicKey)
}
```

**File:** `apps/e2e-server/cmd/server/main.go:243-254` -- shutdown sequence:
```go
<-quit
cleanupCancel() // only cancels cleanup ticker
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
server.Shutdown(shutdownCtx)
```

The `notifyIdentityChanged` goroutine uses `context.Background()` with a 5-second timeout for each request. It is **not** connected to any shutdown signal. During graceful shutdown, `server.Shutdown` stops accepting new requests and waits for in-flight requests, but it does NOT wait for goroutines spawned by handlers.

Compare to livekit-server which correctly uses `shutdownCtx`:
```go
handlerCtx, handlerCancel := context.WithCancel(context.Background())
// ... passed to handler.NewWithContext(handlerCtx, ...)
// ... on shutdown:
handlerCancel() // cancels handler goroutines
```

The e2e-server's handler is created with `handler.New(...)` which has no context parameter. The goroutine in `notifyIdentityChanged` uses `context.Background()` and will continue running after `server.Shutdown` returns. If the process exits while the goroutine is mid-request, the webhook is silently lost.

**Impact:** During server restarts/deployments, identity-change webhooks may be lost. The NestJS side would never create the SYSTEM message, and users would not be notified about the security code change. This is a security-relevant reliability gap.

---

### I02-F12: NestJS InternalE2EController reads secret from `process.env` on every request [LOW]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts:44-50` vs `apps/api/src/modules/messages/internal-e2e.controller.ts:44`

The `InternalPushController` reads the secret once in the constructor:
```typescript
this.serviceKey = configService.get<string>('INTERNAL_SERVICE_KEY', '');
```

The `InternalE2EController` reads it from `process.env` on every request:
```typescript
const secret = process.env.INTERNAL_WEBHOOK_SECRET;
```

Reading from `process.env` on every request is not a performance concern (it's a simple object lookup), but it's an inconsistency. More importantly, the `InternalE2EController` does not use NestJS `ConfigService`, making it harder to mock in tests and inconsistent with the codebase pattern.

**Impact:** No security or performance impact. Code hygiene / consistency issue only.

---

### I02-F13: Mobile e2eApi.ts timeout (15s) vs Go server read timeout (10s) [LOW]

**File:** `apps/mobile/src/services/signal/e2eApi.ts:112` -- `setTimeout(() => controller.abort(), 15000)`
**File:** `apps/e2e-server/cmd/server/main.go:226` -- `ReadTimeout: 10 * time.Second`

The Go server has a `ReadTimeout` of 10 seconds (time from connection accept to full request body read). The mobile client has a 15-second abort timeout. If the request takes 11 seconds to send (e.g., slow upload on 3G), the Go server closes the connection, but the mobile client waits another 4 seconds before timing out. The client receives a generic network error instead of a clear timeout indication.

Additionally, the `WriteTimeout` on the Go server is 30 seconds, which is generous and shouldn't cause issues for response delivery.

**Impact:** On very slow networks, the Go server may close the connection before the mobile client's timeout fires, resulting in an ambiguous network error. Minor UX issue.

---

### I02-F14: PQXDH (pqPreKey) missing from Go e2e-server bundle response [INFO]

**File:** `apps/mobile/src/services/signal/e2eApi.ts:28-47` (RawPreKeyBundle has `pqPreKey` field)
**File:** `apps/e2e-server/internal/model/types.go:38-53` (PreKeyBundle struct has NO `pqPreKey` field)

The mobile client's `RawPreKeyBundle` type includes:
```typescript
pqPreKey?: { keyId: number; publicKey: string; signature: string; };
```

But the Go server's `PreKeyBundle` struct does not have a `pqPreKey` field. The mobile adapter at `e2eApi.ts:224-253` does not convert `pqPreKey` either -- it only converts `identityKey`, `signedPreKey`, `oneTimePreKey`, and `supportedVersions`.

The `negotiateProtocolVersion` function (line 347-358) checks `isPQXDHAvailable()` and advertises version 2 only when ML-KEM is available. But even if both sides support v2, the bundle response has no PQ pre-key to use for PQXDH key exchange.

**Impact:** PQXDH (post-quantum) key exchange is advertised via `supportedVersions: [1, 2]` but there is no server-side storage or retrieval of PQ pre-keys. This means version negotiation may select v2, but the X3DH handshake would fail or fall back to v1 because the PQ pre-key is missing. This is documented as incomplete ("ML-KEM-768 post-quantum hybrid (PQXDH) -- version negotiation [1, 2]" in CLAUDE.md) but represents a potential runtime failure if a client has `isPQXDHAvailable() === true`.

---

### I02-F15: NestJS ThrottleGuard may block internal service calls [MEDIUM]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts:60`
```typescript
@Throttle({ default: { limit: 30, ttl: 60000 } })
```

**File:** `apps/api/src/modules/messages/internal-e2e.controller.ts:37`
```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } })
```

Both internal endpoints use NestJS `@Throttle` decorator. The default ThrottleGuard uses the client's IP address as the key. Since all requests from the Go livekit-server come from the **same IP** (Railway container or internal network), the 30 req/min limit for push and 5 req/min limit for identity-changed applies to the **entire service**, not per-user.

For the push endpoint: If there are more than 30 incoming calls per minute across all users, the 31st push notification is rate-limited. During peak usage, this could cause missed call notifications.

For the identity-changed endpoint: If more than 5 users change their identity keys in any 60-second window, the 6th webhook is rejected. This is especially problematic during app updates where many users reinstall simultaneously.

**Impact:** Service-to-service rate limiting based on source IP will cause silent notification loss under moderate load. The rate limiter should either be disabled for internal endpoints (since they already have their own Go-side rate limiting) or use a different key strategy.

---

### I02-F16: e2e-server response body not drained before close [LOW]

**File:** `apps/e2e-server/internal/handler/handler.go:601, 615`

```go
resp.Body.Close()
```

The response body is closed without being fully read/drained. In Go's HTTP client, if you close the body without reading it, the underlying TCP connection **cannot be reused** by the connection pool (it must be closed). Since the webhook endpoint is called rarely (only on identity key changes), this has negligible performance impact. But it's a Go anti-pattern.

The livekit-server has the same pattern at `handler.go:1141`.

**Impact:** TCP connections to NestJS are not reused. Under the current low call volume, no real impact. At scale, this would increase TCP connection churn.

---

## Summary

| ID | Severity | Finding | Path |
|----|----------|---------|------|
| F01 | **CRITICAL** | deleteIngress route mismatch -- method (POST vs DELETE) and param transport (body vs query) | P4 |
| F02 | MEDIUM | e2e-server webhook retry context leak on first attempt | P2 |
| F03 | **HIGH** | e2e-server webhook secret not validated at startup (silent failure) | P2 |
| F04 | MEDIUM | livekit push has no idempotency -- duplicate notifications on retry | P1 |
| F05 | MEDIUM | e2e-server webhook has no idempotency -- duplicate SYSTEM messages | P2 |
| F06 | LOW | Push endpoint uses raw key (not HMAC) -- secret in header on wire | P1 |
| F07 | LOW | e2eApi.ts strips error response body -- debugging harder | P3 |
| F08 | MEDIUM | api.ts unwrapping may strip e2eeKey/token from livekit responses | P4 |
| F11 | MEDIUM | e2e-server webhook goroutine has no shutdown coordination | P2 |
| F12 | LOW | InternalE2EController reads secret from process.env, not ConfigService | P2 |
| F13 | LOW | Mobile 15s timeout vs Go 10s ReadTimeout -- ambiguous errors | P3 |
| F14 | INFO | pqPreKey missing from Go server -- PQXDH advertised but unimplemented | P3 |
| F15 | MEDIUM | NestJS ThrottleGuard uses IP-based rate limiting for server-to-server calls | P1, P2 |
| F16 | LOW | Response body not drained before close (connection pool anti-pattern) | P1, P2 |

### Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 6 |
| LOW | 5 |
| INFO | 1 |
| **Total** | **14** |

### What's Done Well

1. **Auth consistency**: Both Go servers use Clerk JWT via the same `clerk-sdk-go/v2` middleware. Mobile clients use `Authorization: Bearer` consistently.
2. **SSRF protection**: Both Go servers use custom `http.Client` with `CheckRedirect: ErrUseLastResponse` and 10s timeouts for outbound calls.
3. **Timing-safe comparison**: NestJS uses `timingSafeEqual` for both internal key and HMAC verification.
4. **HMAC verification on e2e webhook**: Uses raw body bytes (not re-serialized JSON), preventing key re-ordering HMAC mismatches.
5. **Panic recovery in goroutines**: Both `sendCallPush` and `notifyIdentityChanged` have `defer recover()`.
6. **URL encoding**: Mobile clients use `encodeURIComponent` for path parameters.
7. **Base64 adapter layer**: `e2eApi.ts` cleanly converts Go's base64 strings to Uint8Array for the signal protocol layer.
8. **livekit-server shutdown coordination**: Uses `shutdownCtx` for handler goroutines -- e2e-server should copy this pattern.
9. **rawBody enabled**: NestJS app creates with `rawBody: true` for correct HMAC verification.
10. **Webhook deduplication on livekit side**: LiveKit webhooks use Redis SETNX with 5-minute TTL to prevent double-processing.
