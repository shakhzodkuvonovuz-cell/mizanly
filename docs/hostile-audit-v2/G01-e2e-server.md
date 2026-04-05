# G01 -- Hostile Audit: Go E2E Key Server

**Date:** 2026-04-05
**Auditor:** Claude Opus 4.6 (1M context)
**Scope:** `apps/e2e-server/internal/handler/handler.go`, `store/postgres.go`, `middleware/*`, `config/*`, `cmd/server/main.go`, `model/types.go`
**Mode:** Read-only paranoid audit. No code fixes.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 8     |
| LOW      | 6     |
| INFO     | 5     |
| **Total** | **26** |

---

## CRITICAL

### G01-C1: Webhook retry loop skips first attempt on non-2xx (context reuse after body consumed)

**File:** `handler.go:576-621` (`notifyIdentityChanged`)
**What:** The retry loop has a structural bug. The first attempt (line 610-620) uses the outer `ctx` with a 5-second timeout created at line 576. But the retry loop runs `for attempt := 0; attempt < 3; attempt++`. On attempt 0, it falls through to the bottom block (lines 609-620) and makes the request. If the first attempt fails, attempt 1 enters the `if attempt > 0` block (lines 583-607) which creates a NEW context and request. But the outer `ctx` created at line 576 with `context.WithTimeout(context.Background(), 5*time.Second)` is never cancelled -- the `defer cancel()` at line 577 only fires when `notifyIdentityChanged` returns, meaning this context's timer starts ticking at function entry, not at the first request.

**Impact:** If the first attempt takes 4 seconds to fail, the outer context has only 1 second remaining. The retry attempts each create their own 5s contexts so they are fine, but the first attempt's context deadline started counting before any backoff/retry happened. The first attempt effectively has a 5s budget starting from when the function entered, not from when the HTTP request was made. This is a minor timing issue but the real problem is the structural complexity inviting further bugs.

**More critically:** The `cancel()` deferred at line 577 is leaked -- it is never called until function return, even though `req` is reassigned on retry. The original context remains active until function return.

**Severity:** CRITICAL -- not because of immediate exploitability, but because this is the identity-key-changed notification path. A failed webhook means users are NOT notified when a contact's identity key changes (potential MITM detection bypass). The retry logic has structural issues that make it unreliable.

### G01-C2: SimpleProtocol mode disables parameterized query protection

**File:** `store/postgres.go:58`
**What:** `config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol` is set for Neon pooler compatibility. SimpleProtocol mode sends queries as text with parameters interpolated by pgx, NOT as separate protocol-level parameters. While pgx's SimpleProtocol mode does escape parameters internally, this is a fundamentally weaker guarantee than the PostgreSQL extended query protocol where parameters are NEVER part of the SQL string.

All queries in postgres.go use `$1`, `$2` parameterized syntax, and pgx's SimpleProtocol mode handles the escaping. However, this means SQL injection protection relies on pgx's string escaping rather than protocol-level separation.

**Impact:** If a pgx bug exists in its SimpleProtocol escaping logic (e.g., for unusual Unicode, NULL bytes, or nested quoting), SQL injection becomes possible. With the extended protocol, parameters never touch the SQL parser. This is a known tradeoff for Neon pooler compatibility but should be documented as an accepted risk.

**Severity:** CRITICAL -- SQL injection is the #1 vulnerability class. The current code is safe assuming pgx's escaping is correct, but the defense-in-depth is reduced from protocol-level to library-level.

---

## HIGH

### G01-H1: HandleGetTransparencyProof is unauthenticated in the handler body (relies solely on middleware)

**File:** `handler.go:458-472`
**What:** `HandleGetTransparencyProof` does NOT check `middleware.UserIDFromContext(r.Context())`. Every other handler has this defense-in-depth check. While the route IS mounted with `auth()` middleware in main.go (line 186), the handler itself has no auth check. If the route is accidentally remounted without auth middleware (during refactoring, new router, etc.), transparency proofs become publicly accessible.

Compare with `HandleGetBundle` (line 216-219) which explicitly documents "G01-#2: Defense-in-depth auth check" and checks `userID == ""`.

**Impact:** Information disclosure -- anyone could enumerate which users have registered E2E keys without authentication. The Merkle tree reveals the existence of all users with identity keys.

**Severity:** HIGH

### G01-H2: HandleGetTransparencyRoot also lacks handler-level auth check

**File:** `handler.go:514-522`
**What:** Same issue as H1. `HandleGetTransparencyRoot` has no `UserIDFromContext` check. The Merkle root alone is less sensitive than individual proofs, but consistency matters.

**Severity:** HIGH

### G01-H3: Batch bundle endpoint consumes OTPs for users without rate-limiting each individual GetPreKeyBundle call

**File:** `handler.go:306-324`
**What:** The batch endpoint rate-limits each target via `CheckBundleFetch` (lines 306-313), then calls `GetPreKeyBundle` in a loop (lines 316-323). `GetPreKeyBundle` atomically claims and deletes an OTP key (DELETE...SKIP LOCKED). However, the rate limit is checked BEFORE the loop, and the loop continues even if some bundles fail. If a rate-limit window is shared between the single-bundle endpoint and the batch endpoint (they use the same `CheckBundleFetch`), an attacker can:
1. Fetch a single bundle (consuming 1 rate limit count)
2. Then fetch a batch of 100 users (consuming 100 rate limit counts)

The per-target limit of 5/hour is shared. But the batch-level limit of 10 calls/hour means 10 * 100 = 1000 unique bundles per hour, each consuming an OTP. The global per-requester limit of 50 unique targets/hour (in CheckBundleFetch) would cap this at 50 OTPs per hour per attacker. This is reasonable but should be documented.

**Real issue:** The batch endpoint calls `GetPreKeyBundle` for each user sequentially. If the batch contains 100 users and `GetPreKeyBundle` takes 50ms each (DB transaction), that's 5 seconds of holding the HTTP connection. No timeout per individual bundle fetch within the batch loop.

**Severity:** HIGH -- OTP pool drain at 50/hour/attacker and potential slow-loris on the batch endpoint.

### G01-H4: StoreSenderKeyRequest has no validation on groupId, recipientUserId, chainId, generation

**File:** `handler.go:350-377`, `model/types.go:77-83`
**What:** `HandleStoreSenderKey` parses the request body but only validates group membership. It does NOT validate:
- `req.GroupID` -- no length check, no control character check (unlike path params which get `validatePathParam`)
- `req.RecipientUserID` -- no length check, no control character check
- `req.ChainID` -- no range validation (could be negative, could be MAX_INT)
- `req.Generation` -- no range validation

These values go directly into SQL parameters. While pgx handles escaping, oversized strings (e.g., 1MB groupId) would be stored in the database and waste storage.

**Severity:** HIGH -- unbounded input reaches database. Could be used for storage exhaustion.

### G01-H5: Sender key store allows any authenticated user to write keys for any recipientUserId within a group

**File:** `handler.go:364-376`
**What:** `HandleStoreSenderKey` verifies that the SENDER (authenticated user) is a member of the group. But it does NOT verify that `req.RecipientUserID` is ALSO a member. An attacker who is a legitimate group member can store sender keys addressed to arbitrary non-member user IDs. When the non-member later joins the group (or if the ID corresponds to a different group), they might receive keys they shouldn't have.

Additionally, `UpsertSenderKey` uses `senderUserID` from the authenticated user, which is correct. But `recipientUserID` is attacker-controlled and not membership-verified.

**Severity:** HIGH -- allows planting sender keys for users who are not group members. The keys are encrypted so the data itself isn't useful, but the database rows exist and could be used for confusion attacks.

---

## MEDIUM

### G01-M1: readJSON accepts any Content-Type (no Content-Type enforcement)

**File:** `handler.go:634-639`
**What:** `readJSON` reads the body and unmarshals JSON without checking that `Content-Type: application/json` was sent. While this isn't typically a direct vulnerability, it means:
- CSRF attacks via form submissions (`application/x-www-form-urlencoded`) could reach the JSON parser
- The 1MB body limit in `readJSON` duplicates the 1MB limit from `MaxBytesHandler` in main.go (line 225), but the interaction is unclear -- the body is read twice-limited

**Severity:** MEDIUM

### G01-M2: CORS allows credentials from any listed origin but does not set Access-Control-Allow-Credentials

**File:** `main.go:130-146`
**What:** The CORS middleware sets `Access-Control-Allow-Origin` to the request's origin if it matches the allowlist, and sets `Access-Control-Allow-Headers: Authorization`. However, it does NOT set `Access-Control-Allow-Credentials: true`. This means browser `fetch()` with `credentials: 'include'` will be rejected by the browser. This is actually GOOD for security (prevents CSRF via credentialed cross-origin requests). But it also means the Authorization header approach only works for non-credentialed requests or same-origin requests.

For a mobile-first API consumed by React Native (not a browser), CORS is largely irrelevant. But the middleware exists and its behavior should be documented.

**Severity:** MEDIUM (defensive posture is correct but undocumented)

### G01-M3: No request body size limit on GET endpoints that shouldn't have bodies

**File:** `handler.go` (all GET handlers)
**What:** GET endpoints like `HandleGetBundle`, `HandleGetPreKeyCount`, `HandleGetDevices`, `HandleGetTransparencyProof`, `HandleGetTransparencyRoot`, `HandleGetSenderKeys` don't call `readJSON`, so they don't enforce the 1MB body limit from `readJSON`. They DO get the global `MaxBytesHandler` 1MB limit from main.go. However, the `MaxBytesHandler` wrapping means the full 1MB body is buffered even for GET requests that ignore the body entirely. A client can send a 1MB body with every GET request, wasting server memory.

**Severity:** MEDIUM -- resource waste, not exploitable for injection.

### G01-M4: OTP claiming in GetPreKeyBundle is within a transaction but uses SKIP LOCKED

**File:** `store/postgres.go:406-423`
**What:** `GetPreKeyBundle` uses `FOR UPDATE SKIP LOCKED` inside a transaction. If two concurrent requests try to claim an OTP for the same user, `SKIP LOCKED` causes the second request to skip the locked row and try the NEXT row. This is intentional for concurrency. However, if there is only ONE OTP left, the second concurrent request will get `pgx.ErrNoRows` and return a bundle without an OTP (3-DH fallback). This is correct behavior but means the last OTP can be "wasted" -- one request claims it, the other silently falls back to 3-DH.

The standalone `ClaimOneTimePreKey` function (line 272) also uses `SKIP LOCKED` but is not called from `GetPreKeyBundle` (the claim is inlined). Code duplication.

**Severity:** MEDIUM -- functional correctness issue, not a security vulnerability.

### G01-M5: Merkle tree backward-compatibility cache key collision

**File:** `store/postgres.go:590-593`
**What:** The Merkle cache stores entries keyed by both `userId:deviceId` and plain `userId` for backward compatibility. The comment says "backward-compat (single-device lookups)". But if a user registers device 1, then device 2, the plain `userId` key points to device 1 (because of `if _, exists := s.cachedLeafIndex[uid]; !exists`). Later, if device 1 is removed but device 2 remains, the plain `userId` still points to device 1's (now stale) index.

The cache is rebuilt on every identity key change (which would re-run the full query), so the stale entry would be overwritten. But during the window between device 1 deletion and the next identity key registration, the plain `userId` key is wrong.

**Severity:** MEDIUM -- incorrect transparency proof for a brief window after device removal.

### G01-M6: No pagination on GetSenderKeys query

**File:** `store/postgres.go:342-366`
**What:** `GetSenderKeys` fetches ALL sender keys for a group addressed to a user, ordered by `createdAt DESC`. In a large group (500 members), each member has a sender key per other member. This could return hundreds of rows. No LIMIT clause, no pagination.

**Severity:** MEDIUM -- potential for large responses in big groups.

### G01-M7: Identity key registration RETURNING subquery races with the UPSERT

**File:** `store/postgres.go:123-132`
**What:** The `UpsertIdentityKey` query uses:
```sql
RETURNING (SELECT "publicKey" FROM e2e_identity_keys WHERE "userId" = $1 AND "deviceId" = $2)
```
The intent is to return the OLD public key before the upsert. However, in PostgreSQL, the RETURNING clause executes AFTER the INSERT/UPDATE. The subquery `SELECT "publicKey" FROM e2e_identity_keys WHERE ...` reads from the SAME row that was just upserted, so it returns the NEW value, not the old value. This means `oldPub` always equals `pubBytes` and `changed` is always `false`.

Wait -- actually, PostgreSQL's RETURNING clause with a subselect is more nuanced. The subselect in RETURNING sees the row AFTER the modification. So this query would return the NEW key, not the OLD key, making the "changed" detection broken.

If this is the case, the identity-changed webhook (line 128) would NEVER fire, meaning users are NEVER notified of identity key changes.

**Severity:** MEDIUM -- I am not 100% certain of PostgreSQL's behavior here. The RETURNING subquery visibility depends on whether it sees the pre-UPDATE or post-UPDATE snapshot. In standard PostgreSQL, a correlated subquery in RETURNING sees the updated row. If so, `changed` is always false. This needs verification against a real database.

**UPDATE:** Actually, upon further reflection, in PostgreSQL the subquery in RETURNING does see the NEW state of the modified row. This would make `changed` always false. This is potentially CRITICAL if confirmed -- it means identity key change detection is broken.

### G01-M8: No validation that StoreSenderKey's senderUserId matches the authenticated user

**File:** `handler.go:370`
**What:** `UpsertSenderKey` is called with `userID` (the authenticated user) as the `senderUserID` parameter. This is correct -- the handler passes the authenticated user's ID, not a client-supplied value. The request body does NOT include a `senderUserId` field (checked in model/types.go:77-83), so the sender is always the authenticated user.

This is actually GOOD design. No finding here. Removing from count.

**Severity:** REMOVED (false positive)

---

## LOW

### G01-L1: HandleUploadSignedPreKey returns 400 for ALL errors including server errors

**File:** `handler.go:161-165`
**What:** If `UpsertSignedPreKey` fails due to a database error (connection timeout, pool exhaustion), the handler returns HTTP 400 (Bad Request) instead of 500. The comment says "V5-F8: Generic error to client" but conflating client errors with server errors breaks HTTP semantics. Clients will retry on 400 (thinking they sent bad data) instead of backing off on 500.

Compare with `HandleRegisterIdentity` (lines 115-121) which distinguishes client vs server errors via error message content. `HandleUploadSignedPreKey` does not do this.

Same issue affects `HandleUploadOneTimePreKeys` (line 200) and `HandleStoreSenderKey` (line 373).

**Severity:** LOW -- incorrect HTTP status codes, not a security vulnerability.

### G01-L2: Rate limiter key format allows collision between different rate limit purposes

**File:** `ratelimit.go:45`, `handler.go:103`
**What:** The bundle fetch rate limit uses key `e2e:rl:{requesterID}:{targetID}`. The identity rate limit uses `e2e:rl:identity:{userID}`. If a userID happens to be `identity`, the keys would collide: `e2e:rl:identity:targetID` vs `e2e:rl:identity:userID`. Clerk user IDs are formatted as `user_xxx` (CUIDs), so `identity` is not a valid Clerk user ID. Still, the key format should use a delimiter that prevents any theoretical collision.

**Severity:** LOW -- Clerk IDs prevent this in practice.

### G01-L3: Transparency signing key is optional (server starts without it)

**File:** `store/postgres.go:85-91`, `config/config.go:40`
**What:** `TransparencySigningKey` is not validated as required in `config.Load()`. If it's empty, the store starts without a signing key, and `GetTransparencyRoot` returns an empty `rootSignature`. Clients that verify the signature would reject the unsigned root. But clients that skip verification (or haven't implemented it yet) would accept unsigned roots from a potentially compromised server.

**Severity:** LOW -- defense-in-depth weakness. Should be required in production.

### G01-L4: Cleanup goroutine has no panic recovery

**File:** `main.go:201-216`
**What:** The daily cleanup goroutine (`go func() { ticker... }`) has no `defer recover()`. If `CleanupExpiredSignedPreKeys` panics (e.g., nil pool after close), the goroutine dies silently. Compare with `notifyIdentityChanged` (handler.go:529-533) which has explicit panic recovery.

**Severity:** LOW -- cleanup is non-critical, but silent goroutine death should be avoided.

### G01-L5: hashUserID truncation to 8 bytes (16 hex chars) may allow collision-based log confusion

**File:** `handler.go:629-632`
**What:** `hashUserID` returns the first 8 bytes (16 hex chars) of SHA-256. With 10M users, the birthday bound for a collision in 64 bits is ~4.3 billion, so collisions are astronomically unlikely at Mizanly's scale. But the truncation means two different users COULD map to the same log hash, making incident investigation ambiguous.

**Severity:** LOW -- theoretical, not practically exploitable.

### G01-L6: Webhook URL is not validated as HTTPS

**File:** `handler.go:537-538`
**What:** `h.cfg.NestJSInternalURL` is used to build the webhook URL. If this is set to an HTTP URL (not HTTPS), the identity-changed webhook (which contains `userID`, `oldFingerprint`, `newFingerprint`) is sent over plaintext. The HMAC signature prevents tampering but not eavesdropping.

In production, NestJS runs behind HTTPS, and this is an internal server-to-server call. But the config does not validate that the URL scheme is HTTPS.

**Severity:** LOW -- internal network, but defense-in-depth missing.

---

## INFO

### G01-I1: Code duplication between ClaimOneTimePreKey and GetPreKeyBundle

**File:** `store/postgres.go:272-295` and `store/postgres.go:406-423`
**What:** The OTP claiming logic (DELETE...WHERE id = (SELECT...SKIP LOCKED)) is duplicated in both `ClaimOneTimePreKey` and `GetPreKeyBundle`. The standalone `ClaimOneTimePreKey` function appears unused -- `GetPreKeyBundle` inlines the claim. If one is updated without the other, behavior diverges.

**Severity:** INFO

### G01-I2: Device linking endpoint is a stub (returns 501)

**File:** `handler.go:477-511`
**What:** `HandleVerifyDeviceLink` is rate-limited and validates input, but always returns 501 Not Implemented. This is a placeholder. The rate limiting still consumes Redis operations for a non-functional endpoint.

**Severity:** INFO

### G01-I3: No request logging middleware

**File:** `main.go:148-232`
**What:** The middleware chain is: `RequestID -> CORS -> SecurityHeaders -> MaxBytesHandler -> mux`. There is no access logging middleware. Failed authentication attempts, rate limit hits, and suspicious patterns are logged individually by handlers, but there is no unified access log showing all requests with method, path, status, duration, and request ID.

**Severity:** INFO -- operational observability gap, not a security vulnerability.

### G01-I4: Config tests modify global os.Environ without t.Parallel() guard

**File:** `config/config_test.go` (all tests)
**What:** Every test in config_test.go calls `os.Setenv` and `os.Unsetenv` on shared environment variables. None of the tests use `t.Parallel()`, which is correct (they'd race on shared env vars). But if someone adds `t.Parallel()` in the future, the tests would become flaky. Consider using `t.Setenv()` (Go 1.17+) which automatically handles cleanup and prevents parallel execution.

**Severity:** INFO

### G01-I5: Merkle tree padding uses zero-hash for non-existent leaves

**File:** `store/postgres.go:729-731`, `store/postgres.go:769-771`
**What:** The Merkle tree pads to power-of-2 with `make([]byte, 32)` (all zeros). This is standard practice for sparse Merkle trees. However, if an attacker registers an identity key whose hash happens to be all zeros (vanity hash), it would be indistinguishable from a padding leaf. The domain separation prefix (0x00 for leaves, 0x01 for internal) mitigates second-preimage attacks but doesn't prevent this specific ambiguity.

In practice, finding a 256-bit preimage is infeasible, so this is theoretical.

**Severity:** INFO

---

## Checklist Answers

### 1. SQL Injection

**Status: PASS (with caveat)**

All queries use `$1`, `$2` parameterized syntax. No string concatenation in SQL. HOWEVER, `SimpleProtocol` mode (G01-C2) means parameters are text-interpolated by pgx rather than protocol-separated. All 16 SQL queries in postgres.go are parameterized. No raw string building.

### 2. Auth

**Status: MOSTLY PASS**

All endpoints are mounted with `auth()` middleware in main.go. All handlers (except `HandleGetTransparencyProof` and `HandleGetTransparencyRoot`) have defense-in-depth `UserIDFromContext` checks. Health endpoint is intentionally unauthenticated. See G01-H1, G01-H2 for the two missing handler-level checks.

### 3. Rate Limiting

**Status: PASS**

Rate limiting uses atomic Lua scripts (INCR+EXPIRE in single eval). Fails closed on Redis error in all three functions (`CheckBundleFetch`, `CheckRateLimit`, `RateLimitMiddleware`). Bundle fetch: 5/target/hour + 50 unique targets/hour. Batch: 10/hour. Identity: 2/24h. Device enumeration: 50/hour. Device link: 5/session.

### 4. Race Conditions

**Status: PASS**

OTP claiming uses `FOR UPDATE SKIP LOCKED` -- concurrent claims get different OTPs. Pre-key upload uses transaction with COUNT + INSERT. Merkle cache uses `sync.RWMutex` with double-check pattern. Identity key upsert uses `ON CONFLICT ... DO UPDATE` (atomic). Sender key upsert uses `ON CONFLICT ... DO UPDATE` (atomic).

### 5. Input Validation

**Status: PARTIAL PASS**

- Identity key: 32 bytes validated, registrationId 1-16383 validated, deviceId 1-10 validated.
- Signed pre-key: 32 bytes validated, 64-byte signature validated, Ed25519 signature verified.
- OTP keys: 32 bytes validated per key, max 100 per upload, max 500 per user.
- Sender key: encrypted key max 1024 bytes, base64 validated. BUT groupId, recipientUserId, chainId, generation are NOT validated (G01-H4).
- Path params: validated via `validatePathParam` (max 64 chars, no control chars).
- Batch: max 100 users, IDs validated (max 128 chars, no control chars, deduplicated).

### 6. Error Exposure

**Status: PASS**

All handlers return generic error messages to clients. Internal errors logged server-side with `h.logger.Error`. User IDs hashed in logs via `hashUserID`. No SQL details, no stack traces in responses. Comment V5-F8 explicitly notes this pattern.

### 7. Prekey Exhaustion

**Status: PASS**

When OTPs are exhausted, `GetPreKeyBundle` returns a bundle without `oneTimePreKey` (nil). The client falls back to 3-DH (X3DH without OTP). `RemainingOneTimeKeys` count is returned so clients can upload more. Rate limiting (50 unique targets/hour) prevents rapid pool draining.

### 8. Transaction Safety

**Status: PASS**

`GetPreKeyBundle` wraps all 4 steps (identity fetch, SPK fetch, OTP claim, OTP count) in a single transaction with `defer tx.Rollback(ctx)`. `InsertOneTimePreKeys` wraps count check + batch insert in a transaction. Sender key operations are single queries with `ON CONFLICT` (atomic).

---

## Risk-Ranked Fix Priority

| # | ID | Severity | Fix Effort | Description |
|---|----|----------|-----------|-------------|
| 1 | G01-M7 | MEDIUM* | Small | Verify RETURNING subquery visibility -- if `changed` is always false, identity key change detection is broken (escalate to CRITICAL) |
| 2 | G01-C1 | CRITICAL | Small | Simplify webhook retry loop -- remove first-attempt special case, use consistent context management |
| 3 | G01-H1 | HIGH | Trivial | Add `UserIDFromContext` check to `HandleGetTransparencyProof` |
| 4 | G01-H2 | HIGH | Trivial | Add `UserIDFromContext` check to `HandleGetTransparencyRoot` |
| 5 | G01-H4 | HIGH | Small | Add length/range validation for groupId, recipientUserId, chainId, generation in StoreSenderKey |
| 6 | G01-H5 | HIGH | Small | Verify recipientUserId is a group member in HandleStoreSenderKey |
| 7 | G01-H3 | HIGH | Medium | Add per-bundle timeout in batch loop, document OTP consumption rate |
| 8 | G01-C2 | CRITICAL | N/A | Document SimpleProtocol as accepted risk; monitor pgx CVEs for escaping bugs |
| 9 | G01-L1 | LOW | Small | Distinguish 400 vs 500 in SPK upload, OTP upload, sender key store |
| 10 | G01-L3 | LOW | Small | Make TransparencySigningKey required in production config |
| 11 | G01-L4 | LOW | Trivial | Add panic recovery to cleanup goroutine |
| 12 | G01-L6 | LOW | Small | Validate webhook URL scheme is HTTPS in production |
