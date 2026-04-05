# I06 — Error Propagation Chain Audit

**Scope:** Full trace: Prisma -> Service -> Controller -> HttpExceptionFilter -> TransformInterceptor -> Mobile api.ts -> Screens  
**Date:** 2026-04-05  
**Auditor:** Hostile self-audit  
**Verdict:** Multiple broken links in the error chain. Silent swallowing, information loss, type mismatches, and missing handlers across every layer.

---

## Architecture Summary

```
[Prisma ORM]
    |  PrismaClientKnownRequestError (P2002, P2025, P2003, ...)
    |  PrismaClientValidationError
    |  PrismaClientUnknownRequestError
    v
[Service Layer]  ~73 service files
    |  throws HttpException subclasses (BadRequest, NotFound, Conflict, Forbidden, InternalServerError)
    |  OR lets Prisma errors bubble uncaught
    v
[Controller Layer]  ~80 controllers
    |  No try/catch — pass-through to NestJS exception pipeline
    v
[HttpExceptionFilter]  @Catch() — catches ALL exceptions (HTTP + non-HTTP)
    |  HttpException -> structured JSON { success, statusCode, errorCode, message, path, timestamp }
    |  Non-HttpException -> 500 "An unexpected error occurred"
    |  WS context -> logs and returns (no response sent)
    v
[TransformInterceptor]  wraps successful responses in { success: true, data, timestamp }
    v
[Mobile api.ts]  ApiClient.request() -> ApiError / ApiNetworkError
    |  Parses res.json().message, constructs ApiError(message, status)
    |  NEVER reads errorCode from server response
    v
[Mobile Screens]  React Query onError, ErrorBoundary, showToast()
```

---

## CRITICAL Findings

### C01: Mobile NEVER reads server `errorCode` field — entire errorCode system is dead code
**Severity:** CRITICAL  
**File:** `apps/mobile/src/services/api.ts:321`  
**Evidence:**
```typescript
throw new ApiError(error.message || `HTTP ${res.status} ${res.statusText}`, res.status);
```
The server sends `{ errorCode: "DUPLICATE_CONTENT" | "RATE_LIMITED" | "CONTENT_FLAGGED" | ... }` via `deriveErrorCode()` in the filter. The mobile client NEVER passes `error.errorCode` to the ApiError constructor. The third parameter `code` is only ever set for the hardcoded `SESSION_EXPIRED` case (line 315).

**Impact:** The entire `deriveErrorCode` system (http-exception.filter.ts:100-115) exists but is invisible to the mobile app. Mobile cannot distinguish between "duplicate content" vs "flagged content" vs generic "bad request" — all 400 errors look the same.

### C02: WsException errors are invisible to mobile clients
**Severity:** CRITICAL  
**File:** `apps/mobile/src/providers/SocketProvider.tsx`, `apps/mobile/src/hooks/conversation/useMessageSend.ts`  
**Evidence:**
- NestJS's default `BaseWsExceptionFilter` emits `WsException` as an `'exception'` event on the socket.
- The mobile app NEVER listens for `'exception'` events. Zero occurrences of `socket.on('exception'` in the entire codebase.
- The gateway also emits `client.emit('error', { message: ... })` for validation failures (lines 441, 462, 478, etc.), but the mobile also NEVER listens for `'error'` events from Socket.io.
- The only error handling on the mobile side for socket operations is the 3-second timeout in `useMessageSend.ts:168`: `setTimeout(() => resolve(null), 3000)`.

**Impact:** When a WebSocket operation fails (auth, membership check, validation, rate limit), the mobile gets no error — it just silently times out after 3 seconds. The user has zero feedback on WHY a message failed to send.

### C03: ValidationPipe array messages corrupt `deriveErrorCode` string matching
**Severity:** HIGH  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:41`  
**Evidence:**
```typescript
const errorCode = this.deriveErrorCode(status, error['message'] as string | undefined);
```
When NestJS's `ValidationPipe` throws a `BadRequestException`, the response body is:
```json
{ "statusCode": 400, "message": ["field must be a string", "field2 is required"], "error": "Bad Request" }
```
The `message` field is a `string[]`, not a `string`. The filter casts it to `string | undefined` and passes it to `deriveErrorCode()`, which calls `(message || '').toLowerCase()`. Calling `.toLowerCase()` on an array produces `undefined` in strict mode or throws. In practice, JavaScript coerces the array to a comma-separated string via `.toString()`, so it may work by accident — but the type is wrong, behavior is fragile, and the error code derivation doesn't account for array inputs.

**Impact:** Validation errors (the most common user-facing errors) get a fragile, accidentally-working error code. The `error['message']` passed in the response body IS correct (it's the array), but the `errorCode` derived from it is unreliable.

### C04: Message dedup has TOCTOU race — P2002 on `clientMessageId` propagates as 500
**Severity:** HIGH  
**File:** `apps/api/src/modules/messages/messages.service.ts:232-240, 289-300, 418`  
**Evidence:**
```typescript
// Dedup check (line 232-240)
if (data.clientMessageId) {
  const existing = await this.prisma.message.findUnique({ where: { clientMessageId: ... } });
  if (existing && ...) return existing;
}
// ... later, create (line 247/418)
const msg = await tx.message.create({ data: { ..., clientMessageId: ... } });
```
Between the `findUnique` and the `create`, a concurrent request can insert the same `clientMessageId`. The `message.create` throws `PrismaClientKnownRequestError` with code `P2002`. This is NOT caught anywhere in `messages.service.ts` (zero P2002/P2025 handlers in the entire file). The error propagates to the gateway's catch block:
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Failed to send message';
  throw new WsException(msg);
}
```
The WsException message will be the raw Prisma error: `"Unique constraint failed on the fields: (`clientMessageId`)"` — which is then invisible to mobile per C02.

**Impact:** Under concurrent message sends (e.g., offline queue flush), duplicate messages cause opaque 500-style errors instead of idempotent success.

---

## HIGH Findings

### H01: 26+ services have Prisma `.create()` on unique-constrained models without P2002 handling
**Severity:** HIGH  
**Evidence from grep:** Services that do `.create()` on models with `@@unique` or `@unique` constraints but have ZERO `P2002` handling:

| Service | Model/Field | Unique Constraint | Risk |
|---------|------------|-------------------|------|
| `messages.service.ts` | Message.clientMessageId | `@unique` | Concurrent dedup race |
| `channels.service.ts` | Channel.userId, Channel.handle, Subscription | `@unique`, `@@unique` | TOCTOU on create + subscribe |
| `live.service.ts` | LiveParticipant | `@@unique([sessionId, userId])` | Concurrent join race |
| `notifications.service.ts` | Notification | create/update/delete | P2025 on delete of already-deleted |
| `telegram-features.service.ts` | SavedMessage, ChatFolder, GroupTopic, CustomEmojiPack | Various | TOCTOU on create |
| `discord-features.service.ts` | ForumThread, ForumReply, Webhook, StageSession | Various | TOCTOU on create |
| `monetization.service.ts` | Tip, MembershipTier | create (non-upsert paths) | Concurrent tip race |
| `gifts.service.ts` | GiftRecord, CoinTransaction | create inside $transaction | Transaction retry on P2002 |
| `users.service.ts` | Report, WatchLater | create | Concurrent report race |
| `moderation.service.ts` | Various creates | create | No Prisma error handling |
| `settings.service.ts` | Various creates/updates | create/update | No Prisma error handling |
| `privacy.service.ts` | Various creates | create | No Prisma error handling |
| `scheduling.service.ts` | ScheduledPost | create | No Prisma error handling |
| `majlis-lists.service.ts` | MajlisList | create | No Prisma error handling |
| `drafts.service.ts` | Draft | create | No Prisma error handling |
| `stream.service.ts` | Stream.streamKey | `@unique` | Concurrent create race |
| `hashtags.service.ts` | Hashtag.name | `@unique` | Concurrent tag creation |
| `channel-posts.service.ts` | ChannelPost | create | No Prisma error handling |
| `profile-links.service.ts` | ProfileLink | create | No Prisma error handling |
| `watch-history.service.ts` | WatchHistory | create | No Prisma error handling |
| `subtitles.service.ts` | Subtitle | `@@unique([videoId, language])` | Concurrent upload race |
| `community-notes.service.ts` | CommunityNote | create | No Prisma error handling |
| `reel-templates.service.ts` | ReelTemplate | create | No Prisma error handling |
| `clips.service.ts` | Clip | create | No Prisma error handling |
| `audio-tracks.service.ts` | AudioTrack | create with pre-check | TOCTOU without P2002 |
| `story-chains.service.ts` | StoryChain | `@@unique([chainId, userId])` | Concurrent join race |

**Pattern:** Most of these use the check-then-create pattern (find + create) without wrapping the create in a P2002 catch. Under concurrent requests, the check passes for both, and the second create throws P2002 which propagates as a raw 500 error.

### H02: Channels service has classic TOCTOU on handle + userId uniqueness
**Severity:** HIGH  
**File:** `apps/api/src/modules/channels/channels.service.ts:68-105`  
**Evidence:**
```typescript
const existing = await this.prisma.channel.findUnique({ where: { userId } });
if (existing) throw new ConflictException('User already has a channel');
const handleTaken = await this.prisma.channel.findUnique({ where: { handle: dto.handle } });
if (handleTaken) throw new ConflictException('Handle already taken');
// RACE WINDOW: another request could create with same userId/handle between check and create
const channel = await this.prisma.channel.create({ data: { userId, handle: dto.handle, ... } });
```
No P2002 handler. If two requests hit simultaneously, both checks pass, and the second `create` throws a raw Prisma error -> 500.

**Impact:** Double-tap on "Create Channel" button could cause 500 error + confusing UX.

### H03: Subscription create in channels has TOCTOU without P2002
**Severity:** HIGH  
**File:** `apps/api/src/modules/channels/channels.service.ts:196-219`  
**Evidence:**
```typescript
const existing = await this.prisma.subscription.findUnique({ where: { userId_channelId: ... } });
if (existing) throw new ConflictException('Already subscribed');
await this.prisma.$transaction([
  this.prisma.subscription.create({ data: { userId, channelId: channel.id } }),
  // ... counter increment
]);
```
Same TOCTOU pattern. P2002 on Subscription unique constraint propagates as 500.

### H04: Live participant join has TOCTOU without P2002
**Severity:** HIGH  
**File:** `apps/api/src/modules/live/live.service.ts:255-276`  
**Evidence:**
```typescript
const existing = await this.prisma.liveParticipant.findUnique({ where: { sessionId_userId: ... } });
if (existing && !existing.leftAt) return { joined: true, ... };
// RACE WINDOW
await this.prisma.liveParticipant.create({ data: { sessionId, userId, ... } });
```
Two concurrent join requests: both see no existing participant, both try to create. Second gets P2002 -> 500.

### H05: HttpExceptionFilter WS path silently drops errors — no client notification
**Severity:** HIGH  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:17-21`  
**Evidence:**
```typescript
if (host.getType() === 'ws') {
  this.logger.error('WebSocket exception', exception instanceof Error ? exception.stack : String(exception));
  return; // <-- just logs and returns, client gets nothing
}
```
When a non-WsException error hits the global filter in WS context (e.g., a Prisma error that bypasses the gateway's try/catch), the filter logs it server-side and returns without any client notification. The socket client hangs forever (or times out after 3s on mobile).

**Impact:** Any unhandled exception in WS handlers that isn't caught by the gateway's explicit try/catch will silently disappear.

---

## MEDIUM Findings

### M01: Non-production and production filter branches are identical for non-HttpException
**Severity:** MEDIUM (dead code, not a bug)  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:73-93`  
**Evidence:** The `if (process.env.NODE_ENV === 'production')` block (lines 73-82) and the `else` block (lines 83-93) produce IDENTICAL responses. The conditional is dead code — both paths return `"An unexpected error occurred"`. This suggests someone intended to add stack traces or debug info in development but never did.

### M02: Mobile api.ts drops `errorCode` and `error` fields from server response
**Severity:** MEDIUM  
**File:** `apps/mobile/src/services/api.ts:319-321`  
**Evidence:**
```typescript
const error = await res.json().catch(() => ({ message: `${res.status} ${res.statusText || 'Request failed'}` }));
throw new ApiError(error.message || `HTTP ${res.status} ${res.statusText}`, res.status);
```
The server response contains `{ success, statusCode, errorCode, error, message, path, timestamp }`. The mobile only reads `.message` and `.status`. All other fields (`errorCode`, `error`, `path`, `timestamp`) are discarded.

**Impact:** The mobile cannot do machine-readable error handling (e.g., "if errorCode is CONTENT_FLAGGED, show moderation dialog"). All error handling is based on string matching of `.message` or status codes only.

### M03: ValidationPipe `message` array not joined for user display
**Severity:** MEDIUM  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:49, 60`  
**Evidence:**
```typescript
message: status >= 500 ? 'Internal server error' : error['message'] ?? exception.message,
```
When `error['message']` is `["field1 must not be empty", "field2 must be a string"]`, the JSON response sends the raw array. The mobile's `error.message` will be the array (parsed by `res.json()`), and then `ApiError.message` will be `"field1 must not be empty,field2 must be a string"` (JavaScript's default Array.toString()).

**Impact:** User sees comma-separated validation messages with no formatting: "field1 must not be empty,field2 must be a string" instead of a properly formatted list.

### M04: Gateway `client.emit('error', ...)` vs `throw new WsException(...)` inconsistency
**Severity:** MEDIUM  
**File:** `apps/api/src/gateways/chat.gateway.ts` (multiple locations)  
**Evidence:** The gateway uses TWO different error patterns:
1. `client.emit('error', { message: '...' })` — for validation and rate limit errors (lines 441, 462, 478, 484, 595-601, etc.)
2. `throw new WsException('...')` — for auth and membership errors (lines 436, 447, 473, 522, 680, etc.)

Pattern 1 sends an 'error' event that the mobile never listens to.
Pattern 2 is caught by NestJS's BaseWsExceptionFilter which sends an 'exception' event that the mobile never listens to.

Both paths result in zero client-visible error feedback.

### M05: `deriveErrorCode` string matching is incomplete — many service error messages don't match
**Severity:** MEDIUM  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:100-115`  
**Evidence:**
```typescript
if (msg.includes('duplicate')) return 'DUPLICATE_CONTENT';
if (msg.includes('flagged') || msg.includes('violation')) return 'CONTENT_FLAGGED';
if (msg.includes('validation')) return 'VALIDATION_ERROR';
```
Many services throw `BadRequestException` with messages that don't match these patterns:
- `"Cannot add more than 100 users at once"` -> `BAD_REQUEST` (not a validation error?)
- `"End time must be after start time"` -> `BAD_REQUEST` (is actually validation)
- `"This conversation requires end-to-end encryption"` -> `BAD_REQUEST` (unique error, no code)
- `"Slow mode: wait 5 seconds"` -> `BAD_REQUEST` (should be RATE_LIMITED but it's 400 not 429)

The string-matching approach is inherently fragile — any new service message that happens to contain "duplicate" or "flagged" will get the wrong code.

### M06: Prisma foreign key errors (P2003) not handled anywhere
**Severity:** MEDIUM  
**Evidence:** Zero occurrences of `P2003` in the entire codebase. When a service tries to create a record with a non-existent foreign key (e.g., creating a message in a deleted conversation), Prisma throws `P2003` which propagates as a raw 500 instead of a 404.

### M07: TransformInterceptor doesn't run on exceptions — error responses bypass success envelope
**Severity:** MEDIUM (by design, but creates inconsistency)  
**File:** `apps/api/src/common/interceptors/transform.interceptor.ts`  
**Evidence:** The interceptor wraps successful responses in `{ success: true, data, timestamp }`. But error responses are formatted by `HttpExceptionFilter` as `{ success: false, statusCode, errorCode, error, message, path, timestamp }`. The two schemas are different:
- Success: `{ success, data, meta?, timestamp }`
- Error: `{ success, statusCode, errorCode, error, message, path, timestamp }`

The mobile's `api.ts` handles this correctly (line 335-338 unwraps success, line 319-321 handles errors), but the API contract is implicitly split across two files with no shared type.

### M08: 204 No Content responses lie about types
**Severity:** MEDIUM  
**File:** `apps/mobile/src/services/api.ts:325`  
**Evidence:**
```typescript
if (res.status === 204) return { success: true } as unknown as T;
```
This casts `{ success: true }` to whatever `T` the caller expects (e.g., `Post`, `User`). Any screen that accesses properties on the "returned object" after a 204 delete will get `undefined` fields.

---

## LOW Findings

### L01: `withRetry` retries 5xx but not network errors from socket operations
**Severity:** LOW  
**File:** `apps/mobile/src/services/api.ts:362-379`  
**Evidence:** `withRetry` only handles `fetch`-based API calls. Socket operations have no retry logic beyond the offline queue. The offline queue (`offlineMessageQueue.ts`) retries messages but other socket operations (join, leave, typing, delivery receipts) have no retry.

### L02: No Sentry capture for 4xx errors — only 5xx
**Severity:** LOW  
**File:** `apps/api/src/common/filters/http-exception.filter.ts:36-38`  
**Evidence:** `if (status >= 500 && exception instanceof Error) { Sentry.captureException(exception); }`. Repeated 403/404 errors that might indicate abuse or broken routes are never captured. Only 500+ goes to Sentry.

### L03: ErrorBoundary exposes raw error messages to user
**Severity:** LOW  
**File:** `apps/mobile/src/components/ErrorBoundary.tsx:39`  
**Evidence:**
```typescript
{this.state.error?.message ?? i18next.t('common.error')}
```
If a Prisma error somehow reaches the mobile (via poorly parsed API response), the raw technical message would be shown to the user. In practice this is mitigated by the filter's generic 500 message, but the ErrorBoundary itself doesn't sanitize.

### L04: ErrorBoundary hardcodes dark theme colors
**Severity:** LOW  
**File:** `apps/mobile/src/components/ErrorBoundary.tsx:50-53`  
**Evidence:** Uses `colors.dark.bg` directly instead of `useThemeColors()`. Comment in file acknowledges this (line 50). Class component can't use hooks.

### L05: Rate limit exceeded in WS gateway returns silently (no error to client)
**Severity:** LOW  
**File:** `apps/api/src/gateways/chat.gateway.ts:437, 458, 482-485`  
**Evidence:** Several handlers check `if (!(await this.checkRateLimit(...))) return;` — they just return without sending any error to the client. The only exception is `send_message` which emits `client.emit('error', { message: 'Rate limit exceeded' })` on line 484, but even that is never received by mobile (per C02).

---

## Summary Table

| ID | Severity | Layer | Description |
|----|----------|-------|-------------|
| C01 | CRITICAL | Mobile | `errorCode` from server NEVER read — entire system is dead code |
| C02 | CRITICAL | Mobile+WS | WsException/error events never listened to — WS errors invisible |
| C03 | HIGH | Filter | ValidationPipe array messages corrupt `deriveErrorCode` type |
| C04 | HIGH | Service+WS | Message dedup TOCTOU — P2002 on clientMessageId -> opaque 500 |
| H01 | HIGH | Service | 26+ services missing P2002/P2025 handlers on unique constraints |
| H02 | HIGH | Service | Channels create has TOCTOU on userId + handle uniqueness |
| H03 | HIGH | Service | Subscription create TOCTOU without P2002 |
| H04 | HIGH | Service | Live participant join TOCTOU without P2002 |
| H05 | HIGH | Filter+WS | Filter WS path silently drops errors — zero client notification |
| M01 | MEDIUM | Filter | Production/development branches identical for non-HttpException (dead code) |
| M02 | MEDIUM | Mobile | Mobile drops errorCode, error, path, timestamp from server response |
| M03 | MEDIUM | Filter | ValidationPipe message arrays rendered as raw comma-separated strings |
| M04 | MEDIUM | Gateway | Two incompatible error patterns (emit vs throw) — both invisible |
| M05 | MEDIUM | Filter | deriveErrorCode string matching is incomplete and fragile |
| M06 | MEDIUM | Service | P2003 (foreign key) errors not handled anywhere — propagate as 500 |
| M07 | MEDIUM | Interceptor+Filter | Success and error response schemas differ with no shared type |
| M08 | MEDIUM | Mobile | 204 responses cast to arbitrary types — fields are undefined |
| L01 | LOW | Mobile | No retry for non-fetch socket operations |
| L02 | LOW | Filter | 4xx errors never captured in Sentry |
| L03 | LOW | Mobile | ErrorBoundary shows raw error messages |
| L04 | LOW | Mobile | ErrorBoundary hardcodes dark theme |
| L05 | LOW | Gateway | Rate limit exceeded returns silently on most WS handlers |

**Total: 4 CRITICAL/HIGH, 7 HIGH, 8 MEDIUM, 5 LOW = 24 findings**

---

## Root Cause Analysis

The error propagation chain has THREE fundamental design gaps:

1. **No shared error contract** between API and mobile. The server sends `errorCode` but mobile ignores it. The server sends array messages but mobile expects strings. There is no TypeScript type shared between `apps/api` and `apps/mobile` for error responses.

2. **No WebSocket error transport** to the client. The gateway uses two patterns (`client.emit('error')` and `throw WsException`) but the mobile subscribes to neither. NestJS's default WS exception filter emits an `'exception'` event that nobody listens to.

3. **TOCTOU as standard pattern** for uniqueness checks. ~26 services use `findUnique` + `create` without P2002 catch handlers. Under concurrent requests (double-tap, offline queue flush, multiple devices), these all produce raw 500 errors instead of idempotent 409 responses.

The fix priority should be:
1. Mobile: listen for WS `'exception'` events + pass `errorCode` from server responses (C01, C02)
2. Services: add P2002/P2025 catch blocks to all uniqueness-sensitive creates (H01-H04, C04)
3. Filter: handle ValidationPipe message arrays properly (C03, M03)
4. Gateway: standardize error emission pattern for WS (M04, H05)
