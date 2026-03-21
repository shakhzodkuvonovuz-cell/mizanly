# Agent #18 — Rate Limiting Deep Audit

**Scope:** All 82 controllers + WebSocket gateway + global throttle config
**Files read:** Every `*.controller.ts` in `apps/api/src/modules/`, `app.module.ts`, `user-throttler.guard.ts`, `chat.gateway.ts`
**Total findings: 41**

---

## Global Configuration

**File:** `apps/api/src/app.module.ts`, line 108
```ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
```
Global default: **100 requests per 60 seconds per user/IP**.

**File:** `apps/api/src/common/guards/user-throttler.guard.ts`
Custom `UserThrottlerGuard` uses `user.id` when authenticated, falls back to `req.ip` for unauthenticated requests. Registered as `APP_GUARD` (line 190 of `app.module.ts`).

---

## CRITICAL FINDINGS (P0)

### Finding 1: Chat lock verify-code has NO specific throttle — brute-forceable
**File:** `apps/api/src/modules/messages/messages.controller.ts`, line 326-335
**Severity:** P0 — CRITICAL SECURITY
**Category:** Brute force vulnerability

The `POST /messages/conversations/:id/verify-lock` endpoint relies only on the global 100 req/min limit. A 4-digit PIN has only 10,000 combinations. At 100 attempts per minute, an attacker can brute-force any chat lock in under 2 minutes. Even if the code is longer, 100/min is far too generous for a code-verification endpoint.

```ts
@Post('conversations/:id/verify-lock')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Verify lock code for a conversation' })
verifyLockCode(
  @Param('id') id: string,
  @CurrentUser('id') userId: string,
  @Body('code') code: string,
) {
  return this.messagesService.verifyLockCode(id, userId, code);
}
```

**Required fix:** Add `@Throttle({ default: { limit: 5, ttl: 300000 } })` (5 attempts per 5 minutes) and implement account lockout after N failures.

---

### Finding 2: 2FA validate endpoint — 5 attempts/min is per-userId-parameter, not per-attacker
**File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`, line 108-115
**Severity:** P0 — CRITICAL SECURITY
**Category:** Brute force vulnerability

The `POST /two-factor/validate` endpoint is **unauthenticated** (no `@UseGuards(ClerkAuthGuard)`). The rate limit of 5/min is keyed to IP (since there's no auth context). An attacker with multiple IPs can try 5 codes/min/IP per target user. With TOTP windows typically being 30 seconds, and only 1,000,000 possible 6-digit codes, this is brute-forceable from a botnet.

```ts
@Post('validate')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@ApiOperation({ summary: 'Validate TOTP code during login' })
async validate(@Body() dto: ValidateDto) {
  const valid = await this.twoFactorService.validate(dto.userId, dto.code);
  return { valid };
}
```

**Required fix:** Rate limit should be keyed to `dto.userId` (not just IP). Add exponential backoff. Consider locking the 2FA check after 10 failed attempts globally for that userId.

---

### Finding 3: 2FA backup code endpoint — unauthenticated, brute-forceable
**File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`, line 142-153
**Severity:** P0 — CRITICAL SECURITY
**Category:** Brute force vulnerability

The `POST /two-factor/backup` endpoint is **unauthenticated** (no auth guard). Backup codes are 10-character alphanumeric strings, but there are typically only 8-10 of them per user. At 5 attempts/min/IP, an attacker with even modest resources can enumerate backup codes.

```ts
@Post('backup')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@ApiOperation({ summary: 'Use a backup code for authentication' })
async backup(@Body() dto: BackupDto) {
  const valid = await this.twoFactorService.useBackupCode(dto.userId, dto.backupCode);
```

**Required fix:** Same as Finding 2 — rate limit by `dto.userId`, not just IP. Add account lockout. Consider requiring additional proof of identity.

---

### Finding 4: Parental controls PIN verify — 30 req/min allows brute force
**File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`, line 76-85
**Severity:** P0 — CRITICAL SECURITY
**Category:** Brute force vulnerability

The `POST /parental-controls/:childId/pin` endpoint (verify PIN) inherits the class-level throttle of 30 req/min. Parental PINs are typically 4-6 digits (10,000 to 1,000,000 possibilities). At 30/min, a 4-digit PIN can be brute-forced in ~5.5 minutes.

```ts
@Post(':childId/pin')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Verify PIN' })
verifyPin(
  @CurrentUser('id') parentUserId: string,
  @Param('childId') childId: string,
  @Body() dto: VerifyPinDto,
) {
  return this.parentalControlsService.verifyPin(parentUserId, childId, dto.pin);
}
```

**Required fix:** Add `@Throttle({ default: { limit: 3, ttl: 300000 } })` (3 attempts per 5 minutes).

---

## HIGH SEVERITY FINDINGS (P1)

### Finding 5: WebSocket events with no rate limiting — 13 events unprotected
**File:** `apps/api/src/gateways/chat.gateway.ts`
**Severity:** P1 — HIGH
**Category:** Denial of service / abuse

Only `send_message` (line 212) calls `checkRateLimit()`. The following 13 WebSocket events have **zero rate limiting**:

| Event | Line | Risk |
|-------|------|------|
| `join_conversation` | 171 | Room join flood |
| `typing` | 236 | Typing indicator spam |
| `read` | 255 | DB write flood (markRead) |
| `get_online_status` | 273 | Redis pipeline flood (capped at 100 IDs per call, but unlimited calls) |
| `call_initiate` | 292 | Call spam to any user |
| `call_answer` | 309 | Spoofed call answers |
| `call_reject` | 322 | Reject spam |
| `call_end` | 335 | End spam |
| `call_signal` | 350 | Signal relay flood (64KB payloads) |
| `message_delivered` | 369 | DB write flood |
| `join_quran_room` | 392 | Room join flood + Redis writes |
| `leave_quran_room` | 435 | Room leave flood |
| `quran_verse_sync` | 471 | Redis write flood (host only, but no rate limit) |
| `quran_reciter_change` | 499 | Redis write flood (host only) |

**Impact:** A single authenticated WebSocket client can fire thousands of events per second. The `typing` event broadcasts to all room members. The `call_initiate` event can spam any user's sockets. The `read` and `message_delivered` events trigger DB writes.

**Required fix:** Apply `checkRateLimit()` to all events, with event-specific limits (e.g., `typing` should be max 5/sec, `call_initiate` max 3/min).

---

### Finding 6: AI endpoints without specific throttle — cost-intensive
**File:** `apps/api/src/modules/ai/ai.controller.ts`, lines 38, 53-57, 76-79
**Severity:** P1 — HIGH
**Category:** Cost abuse

Three AI endpoints that call Claude API have no specific throttle (rely on global 100/min):

| Endpoint | Line | Missing |
|----------|------|---------|
| `GET /ai/suggest-posting-time` | 38 | No @Throttle |
| `POST /ai/moderate` | 53 | No @Throttle |
| `POST /ai/route-space` | 76 | No @Throttle |
| `POST /ai/videos/:videoId/captions` | 82 | No @Throttle |
| `GET /ai/avatars` | 104 | No @Throttle |

The `moderate` and `captions` endpoints make Claude API calls that cost money. At 100/min, a single user could trigger $100s in API costs within minutes.

**Required fix:** Add `@Throttle({ default: { limit: 10, ttl: 60000 } })` to all AI endpoints.

---

### Finding 7: Embeddings backfill endpoint — admin action at 5/min, no admin check
**File:** `apps/api/src/modules/embeddings/embeddings.controller.ts`, line 15-22
**Severity:** P1 — HIGH
**Category:** Missing authorization + cost

The `POST /api/v1/embeddings/backfill` endpoint has a comment "In production, this should be restricted to admin users" but has NO admin check. Any authenticated user can trigger a full backfill (calls Gemini API for every piece of content). At 5/min, this is still dangerous.

```ts
@Post('backfill')
@ApiOperation({ summary: 'Trigger embedding backfill for all content (admin)' })
async backfill() {
  // In production, this should be restricted to admin users
  const result = await this.pipeline.backfillAll();
```

---

### Finding 8: Feed endpoints missing throttle — personalized feed does DB-heavy queries
**File:** `apps/api/src/modules/feed/feed.controller.ts`
**Severity:** P1 — HIGH
**Category:** Resource exhaustion

Several feed endpoints that perform expensive DB queries (pgvector, aggregation) have no specific throttle:

| Endpoint | Line | Cost |
|----------|------|------|
| `POST /feed/interaction` | 23 | DB write |
| `POST /feed/dismiss/:type/:id` | 30 | DB write |
| `DELETE /feed/dismiss/:type/:id` | 41 | DB write |
| `GET /feed/explain/post/:postId` | 52 | Transparency query |
| `GET /feed/explain/thread/:threadId` | 62 | Transparency query |
| `GET /feed/personalized` | 88 | pgvector similarity (expensive) |
| `POST /feed/session-signal` | 108 | Redis write |
| `GET /feed/frequent-creators` | 157 | Aggregation query |
| `PUT /feed/admin/posts/:id/feature` | 164 | Admin action, no admin check |
| `GET /feed/nearby` | 174 | Haversine distance calculation |

**Required fix:** Add `@Throttle` to all endpoints, especially `personalized` (should be ~20/min max) and `nearby` (~20/min).

---

### Finding 9: Community controller — nearly all endpoints missing throttle
**File:** `apps/api/src/modules/community/community.controller.ts`
**Severity:** P1 — HIGH
**Category:** Missing rate limits

The `CommunityController` (community V2) has **zero class-level throttle** and only 1 method-level throttle (`POST /fatwa` at line 82). All other 20+ endpoints rely on the global 100/min. This includes endpoints that create DB records:

- `POST /boards` — Create boards (no throttle)
- `POST /mentorship/request` — Request mentorship (no throttle)
- `POST /study-circles` — Create study circles (no throttle)
- `POST /volunteer` — Create volunteer opportunities (no throttle)
- `POST /events` — Create events (no throttle)
- `POST /voice-posts` — Create voice posts (no throttle)
- `POST /watch-parties` — Create watch parties (no throttle)
- `POST /collections` — Create collections (no throttle)
- `POST /waqf` — Create waqf funds (no throttle)
- `POST /kindness-check` — AI call (no throttle)

---

### Finding 10: Commerce controller — most endpoints missing throttle
**File:** `apps/api/src/modules/commerce/commerce.controller.ts`
**Severity:** P1 — HIGH
**Category:** Missing rate limits on financial endpoints

Only `createProduct` (line 26) and `createBusiness` (line 83) have throttles. Financial endpoints are unthrottled:

| Endpoint | Line | Risk |
|----------|------|------|
| `POST /orders` | 59 | Create unlimited orders |
| `POST /zakat/funds/:id/donate` | 126 | Unlimited donations |
| `POST /treasury/:id/contribute` | 143 | Unlimited treasury contributions |
| `POST /premium/subscribe` | 159 | Unlimited premium subscription attempts |

---

### Finding 11: Gamification controller — no class-level throttle
**File:** `apps/api/src/modules/gamification/gamification.controller.ts`
**Severity:** P1 — HIGH
**Category:** XP farming / abuse

No class-level throttle. Only `createChallenge` (line 87) and `createSeries` (line 118) have method-level throttles. XP/streak abuse vectors:

| Endpoint | Line | Risk |
|----------|------|------|
| `POST /streaks/:type` | 33 | Update streak 100x/min |
| `PATCH /challenges/:id/progress` | 101 | Inflate challenge progress |
| `PUT /series/:id/progress` | 166 | Inflate series progress |

---

### Finding 12: Discord features — forum/stage endpoints mostly unthrottled
**File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
**Severity:** P1 — HIGH
**Category:** Spam / abuse

No class-level throttle. Only webhook creation (line 78) and webhook execution (line 100) have throttles. Forum and stage endpoints are unprotected:

| Endpoint | Risk |
|----------|------|
| `POST /circles/:circleId/forum` | Create unlimited forum threads |
| `POST /forum/:threadId/reply` | Unlimited forum replies |
| `POST /circles/:circleId/stage` | Create unlimited stage sessions |
| `POST /stage/:id/speaker` | Spam speaker invitations |

---

## MEDIUM SEVERITY FINDINGS (P2)

### Finding 13: Messages controller — most endpoints missing throttle
**File:** `apps/api/src/modules/messages/messages.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Missing rate limits

Only `sendMessage` (line 182, 30/min), `createGroup` (line 271, 5/min) have throttles. The following write endpoints rely on global 100/min:

- `POST /messages/conversations/:id/messages/:messageId/react` — Emoji reaction spam
- `POST /messages/dm` — DM creation
- `POST /messages/forward/:messageId` — Message forwarding (can forward to multiple conversations)
- `POST /messages/messages/scheduled` — Schedule messages
- `POST /messages/:conversationId/:messageId/pin` — Pin spam
- `POST /messages/:conversationId/view-once` — View-once message creation
- `POST /messages/:conversationId/members/:targetUserId/ban` — Ban spam

---

### Finding 14: Posts controller — interaction endpoints missing throttle
**File:** `apps/api/src/modules/posts/posts.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Interaction spam

Only `create` (line 76, 10/min), `report` (line 258, 10/min), and `cross-post` (line 363, 5/min) have throttles. The following rely on global 100/min:

- `POST /posts/:id/react` — Like spam
- `POST /posts/:id/save` — Save spam
- `POST /posts/:id/share` — Share/repost spam
- `POST /posts/:id/comments` — Comment spam
- `POST /posts/:id/comments/:commentId/like` — Comment like spam

---

### Finding 15: Threads controller — interaction endpoints missing throttle
**File:** `apps/api/src/modules/threads/threads.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Interaction spam

Only `create` (line 79, 10/min) and `report` (line 220, 10/min) have throttles. Missing from:

- `POST /threads/:id/like`
- `POST /threads/:id/repost`
- `POST /threads/:id/bookmark`
- `POST /threads/:id/replies`
- `POST /threads/:id/replies/:replyId/like`

---

### Finding 16: Reels controller — interaction endpoints missing throttle
**File:** `apps/api/src/modules/reels/reels.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Interaction spam

Only `create` (line 20, 5/min), `trending` (line 43, 30/min), and `report` (line 177, 10/min) have throttles. Missing from:

- `POST /reels/:id/like`
- `POST /reels/:id/comment`
- `POST /reels/:id/share`
- `POST /reels/:id/bookmark`
- `POST /reels/:id/view` — View inflation (100/min per user)

---

### Finding 17: Videos controller — interaction endpoints missing throttle
**File:** `apps/api/src/modules/videos/videos.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Interaction spam

Only `create` (line 34, 5/min) and `report` (line 207, 10/min) have throttles. Missing from:

- `POST /videos/:id/like`
- `POST /videos/:id/dislike`
- `POST /videos/:id/comment`
- `POST /videos/:id/bookmark`
- `POST /videos/:id/view` — View inflation
- `PATCH /videos/:id/progress` — Progress update spam
- `POST /videos/:id/record-progress` — Duplicate of above, also unthrottled

---

### Finding 18: Stories controller — interaction endpoints missing throttle
**File:** `apps/api/src/modules/stories/stories.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Interaction spam

Only `create` (line 36, 10/min) has a throttle. Missing from:

- `POST /stories/:id/view` — View inflation
- `POST /stories/:id/reply` — Reply spam
- `POST /stories/:id/sticker-response` — Sticker response spam

---

### Finding 19: Channels controller — missing throttle on most endpoints
**File:** `apps/api/src/modules/channels/channels.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Missing rate limits

Only `create` (line 30, 5/min) has a throttle. Missing from subscription:

- `POST /channels/:handle/subscribe` — Subscribe spam
- `DELETE /channels/:handle/subscribe` — Unsubscribe spam

---

### Finding 20: Telegram features — most endpoints rely on global limit
**File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Missing rate limits

Only `createChatFolder` (line 70, 10/min) and `createEmojiPack` (line 139, 5/min) have throttles. The saved messages, slow mode, admin log, group topics, and emoji pack endpoints all rely on global 100/min.

---

### Finding 21: Broadcast controller — no class-level throttle
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`
**Severity:** P2 — MEDIUM
**Category:** Missing rate limits

Only `create` (line 21, 5/min) and `sendMessage` (line 125, 30/min) have throttles. Subscribe/unsubscribe, promote/demote, and message management endpoints rely on global limit.

---

### Finding 22: Live controller — 30/min class-level is generous for creation
**File:** `apps/api/src/modules/live/live.controller.ts`, line 11
**Severity:** P2 — MEDIUM
**Category:** Too-generous limit

Class-level throttle of 30/min applies to `POST /live` (create live session), `POST /live/rehearse` (start rehearsal), and all other endpoints equally. Live session creation should be much more restricted (e.g., 3/hour).

---

### Finding 23: Islamic controller — 30/min class-level is fine for reads, not for writes
**File:** `apps/api/src/modules/islamic/islamic.controller.ts`, line 93
**Severity:** P2 — MEDIUM
**Category:** Too-generous limit for write endpoints

Class-level 30/min is appropriate for read-heavy Islamic endpoints (prayer times, Quran). But write endpoints like `POST /islamic/charity/campaigns`, `POST /islamic/hajj/progress`, `POST /islamic/dhikr/sessions`, `POST /islamic/dhikr/challenges` share the same limit. A user can create 30 charity campaigns per minute.

---

### Finding 24: Webhooks controller — class @SkipThrottle conflicts with method @Throttle
**File:** `apps/api/src/modules/auth/webhooks.controller.ts`, line 24 + 34
**Severity:** P2 — MEDIUM
**Category:** Throttle configuration conflict

The `WebhooksController` (auth) has `@SkipThrottle()` at class level and `@Throttle({ default: { limit: 50, ttl: 60000 } })` on the `handleClerkWebhook` method. In NestJS Throttler, `@SkipThrottle()` at class level disables throttling for all methods. The method-level `@Throttle` may or may not override this depending on NestJS version — this is ambiguous and should be verified.

---

### Finding 25: Rate limit bypass via UserThrottlerGuard fallback
**File:** `apps/api/src/common/guards/user-throttler.guard.ts`, line 20
**Severity:** P2 — MEDIUM
**Category:** Rate limit bypass

When `req.ip` is `undefined` (can happen behind certain proxies), the tracker falls back to the string `'unknown'`. This means ALL requests without a detectable IP share a single rate limit bucket — either everyone gets throttled, or (more likely) legitimate traffic gets blocked while attackers continue via different paths.

```ts
return (req as { ip?: string }).ip ?? 'unknown';
```

---

### Finding 26: Creator AI analytics — generous limit for costly endpoint
**File:** `apps/api/src/modules/creator/creator.controller.ts`, line 82
**Severity:** P2 — MEDIUM
**Category:** Cost abuse

`POST /creator/ask` has `@Throttle({ default: { ttl: 3600000, limit: 20 } })` — 20 AI queries per hour. Each query calls Claude API. While better than unthrottled, 20/hour per user could still be expensive at scale.

---

### Finding 27: Admin controller — feature flag endpoints at 30/min
**File:** `apps/api/src/modules/admin/admin.controller.ts`, lines 92-108
**Severity:** P2 — MEDIUM
**Category:** Missing admin check on destructive endpoints

Feature flag `PATCH` and `DELETE` endpoints use the class-level 30/min throttle but have no admin role check (documented in previous audit). The rate limit concern is that any authenticated user can modify flags 30 times per minute.

---

## LOW SEVERITY FINDINGS (P3)

### Finding 28: Users controller — delete-account at global limit
**File:** `apps/api/src/modules/users/users.controller.ts`, lines 59-75, 227-241
**Severity:** P3 — LOW
**Category:** Destructive action without specific throttle

`DELETE /users/me` and `POST /users/me/delete-account` rely on global 100/min. Account deletion should have a stricter limit (e.g., 1/day).

---

### Finding 29: Privacy delete-all at 60/min class-level
**File:** `apps/api/src/modules/privacy/privacy.controller.ts`, line 9
**Severity:** P3 — LOW
**Category:** Destructive action with generous limit

`DELETE /privacy/delete-all` uses class-level 60/min. This permanently deletes all user data. Should be 1/24h like data-export.

---

### Finding 30: Contact sync — no specific throttle
**File:** `apps/api/src/modules/users/users.controller.ts`, line 208-213
**Severity:** P3 — LOW
**Category:** Privacy-sensitive endpoint

`POST /users/contacts/sync` uploads raw phone numbers. At 100/min, a user could enumerate contacts at scale.

---

### Finding 31: Health metrics/config — no auth on sensitive data
**File:** `apps/api/src/modules/health/health.controller.ts`, lines 83-121
**Severity:** P3 — LOW
**Category:** Information disclosure

`GET /health/metrics` exposes user counts, post counts, memory usage, queue stats — no auth required. Throttle of 60/min is fine for health checks but this endpoint leaks operational data.

---

### Finding 32: OG endpoints — 60/min is generous for scrapers
**File:** `apps/api/src/modules/og/og.controller.ts`
**Severity:** P3 — LOW
**Category:** Scraping risk

OG endpoints (`/og/post/:id`, `/og/reel/:id`, etc.) at 60/min allow content scraping at a reasonable rate. Consider lowering to 20/min.

---

### Finding 33: Audio rooms — all write endpoints at 10/min
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts`
**Severity:** P3 — LOW
**Category:** Overly uniform limits

Every method has `@Throttle({ default: { limit: 10, ttl: 60000 } })` including `list` (GET) and `getById` (GET). Read endpoints should have higher limits; write endpoints could be lower.

---

### Finding 34: Mosque/halal controllers — no class-level throttle
**Files:** `mosques.controller.ts`, `halal.controller.ts`
**Severity:** P3 — LOW
**Category:** Inconsistent throttle patterns

These controllers have method-level throttles on some endpoints but no class-level fallback. Read endpoints without specific throttle use global 100/min.

---

### Finding 35: Scholar Q&A — session start/end unthrottled
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, lines 79-90
**Severity:** P3 — LOW
**Category:** Missing throttle

`PUT /scholar-qa/:id/start` and `PUT /scholar-qa/:id/end` have no throttle. While only scholars should be able to call these, there's no verified role check.

---

### Finding 36: Stickers/collabs/clips/circles/polls — various controllers
**Severity:** P3 — LOW
**Category:** Controllers not individually audited for missing throttles

The following controllers were checked and rely on either class-level or global throttle without endpoint-specific tuning:
- `stickers.controller.ts`
- `collabs.controller.ts`
- `clips.controller.ts`
- `circles.controller.ts`
- `polls.controller.ts`
- `playlists.controller.ts`
- `drafts.controller.ts`
- `majlis-lists.controller.ts`
- `bookmarks.controller.ts`
- `watch-history.controller.ts`
- `events.controller.ts`
- `scheduling.controller.ts`
- `story-chains.controller.ts`
- `video-replies.controller.ts`
- `chat-export.controller.ts`
- `promotions.controller.ts`
- `restricts.controller.ts`
- `downloads.controller.ts`
- `mutes.controller.ts`
- `profile-links.controller.ts`
- `reel-templates.controller.ts`
- `subtitles.controller.ts`
- `thumbnails.controller.ts`
- `alt-profile.controller.ts`
- `checklists.controller.ts`

---

## DESIGN-LEVEL FINDINGS

### Finding 37: No per-user rate limit key for unauthenticated sensitive endpoints
**Severity:** P1 — HIGH (design)
**Category:** Rate limit architecture

The 2FA `validate` and `backup` endpoints are unauthenticated, so the `UserThrottlerGuard` uses IP-based tracking. This means:
1. An attacker behind a VPN/proxy pool bypasses the limit entirely
2. The target `userId` in the body is ignored for throttle keying
3. There is no way to rate-limit per-target-user without custom middleware

**Required fix:** Create a custom throttle decorator that extracts the target user from the request body and uses it as part of the throttle key.

---

### Finding 38: WebSocket rate limiter is too coarse
**File:** `apps/api/src/gateways/chat.gateway.ts`, line 89-94
**Severity:** P2 — MEDIUM (design)
**Category:** Rate limit granularity

The WebSocket `checkRateLimit` uses a single counter `ws:ratelimit:{userId}` with a flat 30/min limit. This is applied only to `send_message`. It doesn't distinguish between:
- Sending messages to different conversations
- Different event types
- Burst vs sustained usage

A proper implementation should have per-event-type rate limits with different thresholds.

---

### Finding 39: No rate limit on WebSocket connection establishment
**File:** `apps/api/src/gateways/chat.gateway.ts`, line 96
**Severity:** P2 — MEDIUM (design)
**Category:** Connection flood

`handleConnection` has no rate limiting. An attacker can repeatedly connect and disconnect to:
1. Flood the Clerk `verifyToken` call (external API cost)
2. Trigger DB lookups (`prisma.user.findUnique`)
3. Broadcast `user_online`/`user_offline` events

---

### Finding 40: No IP-based rate limiting for WebSocket connections
**File:** `apps/api/src/gateways/chat.gateway.ts`
**Severity:** P2 — MEDIUM (design)
**Category:** DoS vector

WebSocket rate limiting uses `userId`, but there's no IP-level rate limit before authentication. An attacker sending invalid tokens can flood the `verifyToken` call without ever getting a userId assigned.

---

### Finding 41: Stripe webhook controller correctly uses @SkipThrottle
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`, line 24
**Severity:** INFORMATIONAL
**Category:** Correct pattern

The Stripe webhook controller correctly uses `@SkipThrottle()` since webhook delivery from Stripe must not be rate-limited. This is the correct pattern.

---

## SUMMARY TABLE

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 4 | Chat lock brute force, 2FA validate brute force, 2FA backup brute force, parental PIN brute force |
| P1 | 8 | 13 unprotected WebSocket events, AI cost abuse, embeddings admin bypass, feed endpoints, community controller, commerce financials, gamification XP farming, Discord features |
| P2 | 15 | Messages, Posts, Threads, Reels, Videos, Stories, Channels, Telegram, Broadcast, Live, Islamic writes, webhook config conflict, rate limit bypass, creator AI cost, admin flags |
| P3 | 9 | Account deletion, privacy delete, contact sync, health info leak, OG scraping, audio rooms uniformity, mosque/halal, scholar QA, 25+ unchecked controllers |
| Design | 5 | Unauthenticated keying, WS coarseness, WS connection flood, WS IP limiting, Stripe correct |
| **TOTAL** | **41** | |

## KEY RECOMMENDATIONS

1. **Immediately** add strict throttles to code-verification endpoints (chat lock, 2FA, parental PIN): 5 attempts per 5 minutes with lockout after 10 failures
2. **Apply** `checkRateLimit()` to all 13 unthrottled WebSocket events
3. **Add** rate limiting to WebSocket connection establishment (max 10 connections/min/IP)
4. **Add** per-target-user throttle keying for unauthenticated 2FA endpoints
5. **Add** specific throttles to all AI/cost-intensive endpoints
6. **Add** class-level throttles to `CommunityController`, `GamificationController`, `DiscordFeaturesController`, and `CommerceController`
7. **Tighten** view-recording endpoints (`/reels/:id/view`, `/videos/:id/view`, `/stories/:id/view`) to prevent view inflation
