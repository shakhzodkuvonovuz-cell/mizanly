# G03 -- Hostile Code Audit: LiveKit Go Server

**Scope:** `apps/livekit-server/internal/handler/handler.go`, `internal/store/store.go`, `internal/middleware/`, `internal/config/`, `internal/model/types.go`, `cmd/server/main.go`  
**Auditor:** Opus 4.6 (1M context)  
**Date:** 2026-04-05  
**Method:** Line-by-line read of every file in scope. Paranoid, adversarial mindset.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 5 |
| MEDIUM   | 9 |
| LOW      | 6 |
| INFO     | 5 |
| **Total** | **27** |

The server is well-built for a first pass -- advisory locks prevent deadlock, E2EE keys are wiped, webhooks are deduplicated, rate limits fail closed, SQL uses parameterized queries throughout. The findings below are real gaps, not nitpicks.

---

## CRITICAL

### G03-C1: HandleCreateToken -- No Rate-Limit Bypass Check for Empty UserID

**File:** `handler.go:286-288`  
**What:** `HandleCreateToken` calls `h.rl.CheckTokenRequest(r.Context(), userID)` but does NOT have the defense-in-depth `if userID == ""` guard that `HandleCreateRoom` has (line 103-106). If the auth middleware ever fails to strip unauthenticated requests (Clerk SDK bug, misconfigured header extraction), an empty userID reaches CheckTokenRequest. The rate limiter DOES check for empty userID and rejects it (ratelimit.go:75-76), so this is a defense-in-depth gap, not an exploitable bypass today. However, the inconsistency between HandleCreateRoom (which has the guard) and HandleCreateToken (which does not) suggests it was forgotten.

**Impact:** If Clerk SDK has a bug that passes through an unauthenticated request with empty Subject, HandleCreateToken would get a rate-limit error, not an auth error -- the user sees "rate limit exceeded" instead of "unauthorized", leaking that the endpoint exists and the rate limiter is the first barrier.

**Fix:** Add `if userID == "" { writeError(w, http.StatusUnauthorized, "unauthorized"); return }` before the rate limit check in HandleCreateToken, HandleDeleteRoom, HandleLeaveRoom, HandleListParticipants, HandleKickParticipant, HandleMuteParticipant, HandleGetHistory, HandleGetActiveCall, HandleGetSession, HandleStartEgress, HandleStopEgress, HandleCreateIngress, HandleDeleteIngress. All 13 authenticated handlers should have this guard.

---

### G03-C2: SimpleProtocol Mode Disables Parameterized Queries

**File:** `store.go:37`  
**What:** `cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol`

SimpleProtocol mode sends queries as simple text protocol where parameters are interpolated by pgx **client-side** into the SQL string before sending to PostgreSQL. This is NOT the same as server-side prepared statements where parameters are sent separately. The pgx library does escape the values, but the escaping depends on pgx's own sanitization logic, not PostgreSQL's native parameterization.

The comment says "required for Neon pooler" -- this is correct (Neon's connection pooler does not support extended query protocol). But it means every `$1`, `$2` placeholder is being string-interpolated by pgx before transmission.

**Impact:** Today all inputs are either UUIDs/CUIDs from Clerk (controlled format) or validated by handler code. But if any future developer passes user input directly to a store method without validation (e.g., a search term), pgx's client-side escaping is the only barrier. This is a weaker guarantee than true parameterized queries. The `CleanupStaleRingingSessions` method (store.go:597) is particularly concerning -- it builds an interval string via `fmt.Sprintf("%d seconds", staleAfterSecs)` which is safe because `staleAfterSecs` is an int, but the pattern is dangerous.

**Fix:** Add a comment at the top of store.go documenting this risk. For the interval construction in CleanupStaleRingingSessions, use `$1 * INTERVAL '1 second'` instead of `CAST($1 AS INTERVAL)` with a string parameter -- currently it passes the entire interval as a string which, under SimpleProtocol, gets string-interpolated. The current code IS safe (pgx escapes the string), but using `$1::int * INTERVAL '1 second'` would be more robust.

---

## HIGH

### G03-H1: E2EE Key Material Returned in CreateRoom Response Body

**File:** `handler.go:279-282`  
**What:** The `HandleCreateRoom` response includes `e2eeKey` and `e2eeSalt` as base64 strings in the JSON response body. The `session` object is also included via `"data": session`. The session struct itself correctly omits E2EE fields (model comment on line 28-31 of types.go). But the key is still in the response as a separate field.

Cache-Control: no-store is set (line 278), which is good. However:
1. The response is logged by any HTTP logging middleware (Sentry sentryhttp handler wraps this endpoint on line 163 of main.go).
2. If the mobile client has any response logging/caching, the key is on disk.
3. The key is in the HTTP response body over TLS, but TLS session tickets on the client device could theoretically be used to decrypt captured traffic post-compromise.

**Impact:** The E2EE key travels over HTTPS, which is fine for the threat model (server-mediated). But the fact that it's in a standard JSON response means it's susceptible to any logging/caching layer on either side.

**Fix:** Consider a separate endpoint specifically for E2EE material that is never wrapped in Sentry middleware. Or ensure Sentry's `sentryhttp.Handle` is configured to NOT capture response bodies (which it doesn't by default, so this is more of a "keep it that way" note).

---

### G03-H2: HandleLeaveRoom TOCTOU on Participant Count

**File:** `handler.go:447-457`  
**What:** After `MarkParticipantLeft` succeeds, the code calculates remaining participants by iterating `session.Participants` (fetched BEFORE the mark-left). The comment on line 444-446 acknowledges this is intentional to avoid a second DB query. However, between the time `GetSessionWithParticipantsByRoomName` was called and `MarkParticipantLeft` executed, another participant could have left (e.g., via a concurrent webhook `participant_left` event). The code subtracts 1 for the current user but doesn't account for any other leaves that happened in the meantime.

**Impact:** In a group call, if two participants leave simultaneously, both may see `totalRemaining > 1` and neither triggers `EndCallSession`. The call session remains in ACTIVE status with no actual participants. The cleanup ticker (CleanupStaleRingingSessions) only catches RINGING sessions, not stale ACTIVE sessions with zero participants.

**Fix:** After MarkParticipantLeft, call `GetActiveParticipantCount` from the DB instead of computing from the stale snapshot. Alternatively, add a cleanup job for ACTIVE sessions where all participants have leftAt != NULL.

---

### G03-H3: No Cleanup Job for Stale ACTIVE Sessions

**File:** `main.go:199-215`, `store.go:593-618`  
**What:** `CleanupStaleRingingSessions` only targets sessions with `status = 'RINGING'`. There is no equivalent cleanup for ACTIVE sessions that have been stuck (e.g., due to the TOCTOU in H2, or if the LiveKit `room_finished` webhook is never delivered). A session could remain in ACTIVE status indefinitely if:
1. All participants leave via HandleLeaveRoom with the TOCTOU race (H2).
2. The `room_finished` webhook fails to deliver (network issue, Redis dedup collision).
3. The LiveKit room is destroyed externally (LiveKit dashboard, API) without emitting a webhook.

**Impact:** Zombie ACTIVE sessions block participants from creating new calls (the CreateCallSession advisory lock checks for ACTIVE sessions). Users could be permanently blocked from making calls until a manual DB fix.

**Fix:** Add a second cleanup job: mark ACTIVE sessions as ENDED if all participants have `leftAt IS NOT NULL` and the session is older than, say, 10 minutes. Or: mark ACTIVE sessions as ENDED if `updatedAt < NOW() - INTERVAL '2 hours'` (no call should last 2 hours without a token refresh).

---

### G03-H4: Webhook Dedup Fails Open When Redis is Unavailable

**File:** `handler.go:894-903`  
**What:** The webhook deduplication logic:
```go
if eventID != "" && h.rdb != nil {
    set, err := h.rdb.SetNX(ctx, dedupKey, "1", webhookDedupTTL).Result()
    if err == nil && !set {
        // Already processed
        return
    }
}
```
If `h.rdb.SetNX` returns an error (Redis down), the code falls through and processes the webhook anyway. This is a fail-OPEN deduplication. Compare with `CheckRateLimit` (ratelimit.go:37-39) which correctly fails CLOSED on Redis error.

**Impact:** During a Redis outage, every webhook is processed, potentially triggering duplicate state transitions (e.g., double ENDED updates, duplicate push notifications). The state transition guards in `UpdateSessionStatus` and `EndCallSession` provide some protection (they check current status), but `participant_joined`/`participant_left` handlers have no idempotency guard beyond the dedup.

**Fix:** Log a warning when Redis dedup fails, and consider whether webhook processing should fail closed (return 503 so LiveKit retries later) or fail open with explicit idempotency guards on each webhook handler.

---

### G03-H5: HandleGetSession Exposes Session Data Without leftAt Check

**File:** `handler.go:667-687`  
**What:** `HandleGetSession` checks `isCallerOrParticipant(session, userID)` which returns true for ANY participant, including those who have already left. A participant who was kicked from a group call can still query the session and see the current participants, status, and metadata.

**Impact:** Kicked/left participants retain read access to the call session indefinitely. They can poll the session endpoint to see when the call ends, who is still in it, and the duration. This is a privacy concern -- if you kick someone from a call, they should not be able to monitor the call's status.

**Fix:** Add a check: if the user's participant record has `leftAt != NULL` AND the session is still ACTIVE, return 403. Alternatively, restrict the response to only include data from before the user left.

---

## MEDIUM

### G03-M1: GetHistory Pagination Limit is Hardcoded to 20

**File:** `handler.go:644`  
**What:** `h.db.GetHistory(r.Context(), userID, cursorPtr, 20)` -- the page size is hardcoded. There is no `limit` query parameter. This is inflexible but not a bug.

**Impact:** Clients cannot request smaller pages (wasteful on slow connections) or larger pages (more round-trips for power users). Minor UX issue.

**Fix:** Accept a `limit` query parameter with validation (min 1, max 100, default 20).

---

### G03-M2: HandleDeleteRoom Does Not Verify Room {id} Format

**File:** `handler.go:361-366`  
**What:** `roomID := r.PathValue("id")` is checked for empty and length > 128, but there's no format validation. The room name format is `call_{16-hex-chars}_{timestamp}_{16-hex-random}` based on the creation logic. An attacker could pass any string up to 128 chars as the room ID, which then gets passed to `GetSessionWithParticipantsByRoomName` (a DB query) and to `h.roomClient.DeleteRoom` (a LiveKit API call).

**Impact:** The DB query is parameterized and safe. The LiveKit SDK call will simply return "room not found". But passing arbitrary strings to external APIs (LiveKit) is a minor attack surface -- an attacker could enumerate room names or probe LiveKit's error handling.

**Fix:** Validate that roomID matches the expected pattern (e.g., `^call_[0-9a-f]+_\d+_[0-9a-f]+$`). Apply the same validation to all handlers that accept room IDs: HandleLeaveRoom, HandleListParticipants, HandleMuteParticipant.

---

### G03-M3: HandleKickParticipant Has No Rate Limit

**File:** `handler.go:520-568`  
**What:** HandleKickParticipant has no rate limiting. A malicious caller could rapidly kick and re-invite participants (if re-invite were implemented) to cause disruption. More realistically, a compromised client could flood the kick endpoint for all participants in rapid succession.

**Impact:** Low practical impact today (kick requires caller role), but inconsistent with the rate-limiting approach on CreateRoom and CreateToken.

**Fix:** Add a rate limit for mutation endpoints: kick, mute, leave, delete, egress start/stop, ingress create/delete.

---

### G03-M4: UpdateSessionDuration Bypasses State Machine

**File:** `store.go:258-264`  
**What:** `UpdateSessionDuration` sets `status = 'ENDED'` unconditionally without checking the current status. This bypasses the `validTransitions` state machine (store.go:205-217). If called on an already-ENDED or MISSED or DECLINED session, it would overwrite the status.

**Impact:** Called only from `HandleWebhook` room_finished handler (handler.go:931), which checks `session.Status != "ENDED" && session.Status != "MISSED" && session.Status != "DECLINED"` before calling. So the handler protects against this. But the store method itself is unsafe -- any future caller could hit this.

**Fix:** Use the `validTransitions` check inside `UpdateSessionDuration`, or have it call `EndCallSession` instead of duplicating the status update logic. At minimum, add a WHERE clause: `AND status IN ('RINGING', 'ACTIVE')`.

---

### G03-M5: EndCallSession CTE Does Not Return Session Update Rows

**File:** `store.go:301-320`  
**What:** The CTE `update_session` updates the session, and the outer query updates participants. `result.RowsAffected()` returns the rows affected by the OUTER query (participants), not the CTE (session). The code ignores the result with `_ = result`. This means if the session was already in a terminal state (WHERE clause `status IN ('RINGING', 'ACTIVE')` doesn't match), the session update silently does nothing, but participants still get marked as left.

**Impact:** Silent no-op on the session update. If called on a session that's already ENDED, only participant leftAt gets updated (harmless but misleading). The caller has no way to know the session wasn't updated.

**Fix:** Return a boolean indicating whether the session was actually updated, or use RETURNING in the CTE to check.

---

### G03-M6: Broadcast Calls Allow Only Caller as Participant

**File:** `handler.go:126-128`  
**What:** For `CallTypeBroadcast`, `allParticipants = []string{userID}`. The CreateCallSession is called with only the caller. This means:
1. No other user is added as a participant in the DB.
2. When someone tries to join via HandleCreateToken, `isCallerOrParticipant` will return false because only the caller is a participant.

However, line 315-316 shows the token endpoint has a special `isBroadcast` path where `canPublish = isCaller(session, userID)` -- and for non-callers, it does NOT check `isCallerOrParticipant`. Wait, re-reading:

```go
if isBroadcast {
    canPublish = isCaller(session, userID)
} else {
    if !isCallerOrParticipant(session, userID) {
        writeError(w, http.StatusForbidden, "not a participant")
        return
    }
}
```

For broadcast calls, the `isCallerOrParticipant` check is SKIPPED entirely. Any authenticated user can request a token for a broadcast room. The token will have `canPublish = false` (viewer), which is the intended behavior for broadcasts. But there's no check on `maxParticipants` -- the MaxBroadcastViewers cap (default 10,000) is set on the LiveKit room itself but not enforced at the token-generation level. More importantly, there's NO authorization check at all -- any user can join any broadcast.

**Impact:** Any authenticated user can join any broadcast room. This might be intentional (public broadcasts) but there's no mechanism for private broadcasts. Also, broadcast viewers are not tracked as participants in the DB, so the call history and active-call checks don't account for them.

**Fix:** Document that broadcasts are public by design, or add an authorization mechanism (e.g., require broadcast link/token, or check if broadcast is public/private).

---

### G03-M7: Token Grant Does Not Restrict CanPublishData

**File:** `handler.go:1020-1028`  
**What:** The `createToken` method sets `CanPublish` and `CanSubscribe` but does not set `CanPublishData`. By default in LiveKit, `CanPublishData` is true when not explicitly set. This means all participants (including viewers in broadcasts) can send data messages to the room.

**Impact:** A broadcast viewer could use LiveKit data channels to send arbitrary messages to all participants. In non-broadcast calls, any participant can send data messages. This is likely fine for 1:1/group calls (data channels are used for signaling) but in broadcasts, viewers should not be able to broadcast data to all other viewers.

**Fix:** Set `CanPublishData: &canPublish` in the grant to tie data publishing to media publishing. Or explicitly set it to false for broadcast viewers.

---

### G03-M8: HandleStopEgress Does Not Validate EgressID Format

**File:** `handler.go:749-787`  
**What:** `req.EgressID` is checked for empty but not for format. It's passed directly to LiveKit SDK: `h.egressClient.StopEgress(sdkCtx, &livekit.StopEgressRequest{EgressId: req.EgressID})`. There's no validation that this egressID actually belongs to the room specified in `req.RoomName`.

**Impact:** A caller could stop a recording on a DIFFERENT room by providing a valid egressID from another room and their own roomName for authorization. The auth check validates the caller owns the room specified in `req.RoomName`, but the egressID could belong to any room. LiveKit SDK will stop whatever egress matches the ID regardless of room.

**Fix:** After fetching the session, verify the egressID belongs to the room by listing active egresses for the room and checking membership. Or trust LiveKit's own authorization (the API key/secret is shared, so all egresses are accessible).

---

### G03-M9: sendCallPush Includes CallerName -- Potential Push Notification Plaintext Leak

**File:** `handler.go:1055-1066`  
**What:** The push notification data includes `callerName` (display name from DB). The E2E crypto rules state: "Push notifications: generic body for ALL messages (no encryption status leak)." The `title` and `body` are generic ("Incoming Call", "You have an incoming call"), which is correct. But `callerName` in the `data` payload means the push infrastructure (APNs/FCM/Expo) can see who is calling whom.

**Impact:** Apple/Google push servers can observe the caller's display name in the push payload data field. This is metadata leakage. The comment on line 1051-1054 acknowledges removing `callerHandle` (user ID) but kept `callerName` for display purposes.

**Fix:** Remove `callerName` from the push data. The callee can resolve the caller's name locally from the session data after opening the app. Alternatively, encrypt the push data payload (requires client-side decryption on notification receipt, which is complex on iOS).

---

## LOW

### G03-L1: envOrDefaultInt Silently Falls Back on Parse Error

**File:** `config.go:159-168`  
**What:** If an env var like `DB_MAX_CONNS` is set to a non-numeric value (e.g., "abc"), `envOrDefaultInt` silently returns the default value. The subsequent validation (line 114) then validates the default, which passes. The operator's intent (setting a specific value) is silently ignored.

**Impact:** Misconfiguration goes undetected. An operator sets `DB_MAX_CONNS=abc` and the server silently uses 10.

**Fix:** Return an error from `envOrDefaultInt` when the env var is set but unparseable, or log a warning.

---

### G03-L2: CORS Allows Three Origins in Production -- api.mizanly.app Unnecessary

**File:** `main.go:123-127`  
**What:** `https://api.mizanly.app` is in the allowed origins list. This is the API domain itself. API-to-API requests (e.g., NestJS -> Go LiveKit server) are server-to-server and don't need CORS. Having the API origin in CORS means a script running on `api.mizanly.app` in a browser could make cross-origin requests to the LiveKit server. Since the API domain shouldn't serve any web pages, this is low risk.

**Impact:** Minimal. But unnecessary attack surface.

**Fix:** Remove `https://api.mizanly.app` from CORS origins unless there's a specific need.

---

### G03-L3: handleWebhook room_finished Sends Missed Call Push Without Verifying Callee Existence

**File:** `handler.go:937-947`  
**What:** When a call ends without being answered (startedAt is nil), the code sends missed call pushes to callees. It builds `calleeIDs` from participants but doesn't check if these users still exist or are active. If a user was deleted between call creation and call timeout, the push goes to NestJS for a non-existent user.

**Impact:** NestJS receives a push request for a deleted user. It should handle this gracefully (skip), but it's an unnecessary request.

**Fix:** Minor -- NestJS should handle this, but filtering deleted users here is defensive.

---

### G03-L4: HandleDeleteIngress Does Not Validate IngressID Format

**File:** `handler.go:843-874`  
**What:** `ingressID := r.PathValue("id")` is not validated for empty or format. An empty ingressID would be passed to `h.ingressClient.DeleteIngress` which would likely return an error, but the error message from LiveKit would be generic.

**Fix:** Add `if ingressID == "" || len(ingressID) > 128 { writeError(...) }`.

---

### G03-L5: MarkParticipantLivekitJoined Does Not Check RowsAffected

**File:** `store.go:359-367`  
**What:** Unlike `MarkParticipantLeft` (which checks RowsAffected), `MarkParticipantLivekitJoined` silently succeeds even if no rows matched. This means if a webhook fires for a participant not in the DB (e.g., a broadcast viewer who was never added to call_participants), the update silently does nothing.

**Impact:** Silent no-op for unknown participants. The webhook handler (handler.go:968) logs nothing about this case.

**Fix:** Check RowsAffected and log when 0 rows were updated.

---

### G03-L6: Webhook Handler Does Not Validate Room Name Length

**File:** `handler.go:887-892`  
**What:** `roomName` is extracted from the webhook event and used in DB queries without length validation. The webhook is HMAC-validated (line 878), so the data comes from LiveKit, not an attacker. But a malicious LiveKit webhook (compromised LiveKit account) could send arbitrarily long room names.

**Impact:** The room name is used in parameterized queries, so no injection risk. But very long strings could cause performance issues in DB index lookups.

**Fix:** Validate `len(roomName) <= 256` before using in queries.

---

## INFO

### G03-I1: No Request Body Logging Middleware -- Good

**File:** `main.go:188`  
**What:** The middleware chain is `RequestID -> CORS -> SecurityHeaders -> mux`. There is no request/response body logging middleware. This is correct because responses contain E2EE key material.

**Status:** Positive finding. Ensure no future developer adds body-logging middleware.

---

### G03-I2: R2 Credentials in Egress Request -- Unavoidable but Notable

**File:** `handler.go:732-736`  
**What:** `HandleStartEgress` passes R2 credentials directly to LiveKit's egress service via the SDK. This means the R2 access key and secret are transmitted to LiveKit Cloud. This is the standard LiveKit egress pattern -- LiveKit needs the credentials to write the recording file.

**Status:** Unavoidable with LiveKit's egress architecture. The R2 credentials should be scoped to write-only on the specific bucket.

---

### G03-I3: Token TTL Default is 2 Hours -- Long for Calls

**File:** `config.go:32`, `handler.go:1026`  
**What:** Token TTL defaults to 7200 seconds (2 hours). For most calls, this is much longer than needed. A compromised token remains valid for up to 2 hours.

**Status:** The CLAUDE.md mentions "Token refresh for 2h+ calls" as a deferred item. For calls under 2 hours, the token validity is fine. For longer calls, it should be refreshed.

---

### G03-I4: No CSRF Protection on POST Endpoints

**File:** `main.go:153-184`  
**What:** The server has no CSRF protection. All POST endpoints require `Authorization: Bearer <clerk_jwt>` which serves as an implicit CSRF token (browser cookies don't include Authorization headers). So this is safe as long as auth is always via Authorization header, never via cookies.

**Status:** Safe today. Would become an issue if cookie-based auth were added.

---

### G03-I5: Cleanup Ticker Runs on Background Context, Not ShutdownCtx

**File:** `main.go:199-215`  
**What:** `cleanupCtx` is created from `context.Background()` with its own cancel, while `handlerCtx` uses a separate `context.Background()` with its own cancel. Both are cancelled during shutdown (lines 236-237). This is fine -- they're separate concerns. But the cleanup ticker could race with the DB close: `cleanupCancel()` is called, then `server.Shutdown()`, then deferred `db.Close()` runs. If the ticker fires between `cleanupCancel` and the goroutine actually exiting, the `CleanupStaleRingingSessions` call might hit a closed DB pool.

**Status:** Very unlikely race (cleanup interval is 30s, shutdown window is 10s). The DB pool handles concurrent Close gracefully (returns errors). Not a practical issue.

---

## Checklist Responses

| # | Question | Answer |
|---|----------|--------|
| 1 | SQL injection? | **No.** All queries use `$1`-style parameterized placeholders. SimpleProtocol mode means pgx does client-side escaping, not true server-side prepared statements, but pgx's escaping is robust. The interval construction in CleanupStaleRingingSessions passes a string but it's derived from an int. No raw string concatenation of user input into SQL anywhere. |
| 2 | Auth on all endpoints? | **Yes with gap.** All endpoints except /health and /webhooks/livekit go through `middleware.RequireAuth()`. Webhooks use HMAC validation. But 13 out of 14 authenticated handlers lack the defense-in-depth `if userID == ""` guard that HandleCreateRoom has (G03-C1). |
| 3 | Room lifecycle? | **Mostly good.** Create -> RINGING -> ACTIVE -> ENDED flow is enforced via state machine. E2EE keys wiped on end. Stale RINGING sessions cleaned up. **Gap:** No cleanup for stale ACTIVE sessions (G03-H3). TOCTOU on participant count during leave (G03-H2). |
| 4 | Token scoping/expiry? | **Good.** Tokens are room-scoped, identity-bound, 2h TTL. CanPublish restricted for broadcast viewers. **Gap:** CanPublishData not explicitly restricted (G03-M7). |
| 5 | Rate limiting? | **Partial.** CreateRoom (10/min) and CreateToken (30/min) are rate-limited. All other mutation endpoints (kick, mute, leave, delete, egress, ingress) have NO rate limiting (G03-M3). Rate limiter correctly fails closed on Redis error. |
| 6 | E2EE key zeroing? | **Good in DB.** Keys are wiped (NULL) via EndCallSession CTE on call end, and via CleanupStaleRingingSessions. Keys excluded from CallSession JSON struct. **Gap:** Key material is in HTTP response body (G03-H1) and push notification data (G03-M9). No in-memory zeroing in Go (GC'd language, not fixable without unsafe). |
| 7 | Input validation? | **Good but inconsistent.** Room IDs validated for empty + length. Participant IDs filtered and deduped. CallType validated via typed enum. Cursor validated for format. **Gaps:** No format validation on room IDs (G03-M2), egressID (G03-M8), ingressID (G03-L4). |
| 8 | Pagination? | **Good.** Composite cursor (createdAt, id) with proper RFC3339Nano validation. Limit+1 fetch for hasMore detection. **Gap:** Hardcoded page size of 20 (G03-M1). |
