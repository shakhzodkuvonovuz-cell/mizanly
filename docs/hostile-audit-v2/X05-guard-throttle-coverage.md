# X05 — Guard & Throttle Coverage Audit (Cross-Module)

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** Every `@Post`, `@Patch`, `@Put`, `@Delete` endpoint across all 83 controllers in `apps/api/src`
**Method:** Exhaustive grep of every mutation decorator, cross-referenced with `@UseGuards(ClerkAuthGuard)` and `@Throttle()` presence at both class-level and method-level

---

## Infrastructure Context

| Layer | Configuration |
|-------|--------------|
| **Global APP_GUARD** | `UserThrottlerGuard` (extends `ThrottlerGuard`) registered as `APP_GUARD` in `app.module.ts` |
| **Global default throttle** | `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 100 }] })` — 100 req/min per user/IP |
| **Storage** | Redis-backed (`ThrottlerStorageRedisService`) when `REDIS_URL` set — shared across instances |
| **Tracker** | `UserThrottlerGuard.getTracker()` uses `userId` when authenticated, falls back to IP, then header fingerprint |
| **Target throttle** | `@TargetThrottle('paramName')` decorator for per-actor-per-target limiting (e.g., spam-follow one user) |

**Key insight:** Because of the global APP_GUARD with 100 req/min default, EVERY endpoint has at minimum 100 req/min rate limiting even without explicit `@Throttle()`. The `@Throttle()` annotations override this default to set tighter limits on sensitive endpoints.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total controllers audited | 83 |
| Total mutation endpoints (@Post/@Patch/@Put/@Delete) | **~390** |
| Endpoints with ClerkAuthGuard (class or method) | ~370 |
| **Endpoints INTENTIONALLY unguarded** (webhooks, internal, public) | ~10 |
| **Endpoints MISSING guard (FINDING)** | **4** |
| Endpoints with explicit @Throttle (tighter than 100/min default) | ~200 |
| Endpoints relying on class-level @Throttle only | ~100 |
| Endpoints relying on global 100/min default only | ~80 |
| **Endpoints where throttle is too permissive (FINDING)** | **~25** |

---

## CRITICAL FINDINGS

### X05-F01: `POST scheduling/publish-overdue` — NO AUTH GUARD [CRITICAL]

**File:** `apps/api/src/modules/scheduling/scheduling.controller.ts:99`
**Endpoint:** `POST /api/v1/scheduling/publish-overdue`
**Current state:** No `@UseGuards(ClerkAuthGuard)`, no class-level guard. Controller has no class-level guard.
**Impact:** Any unauthenticated user can trigger publishing of ALL overdue scheduled content for ALL users. This is a cron/internal endpoint exposed to the public internet without any authentication.
**Severity:** CRITICAL
**Fix:** Add `@UseGuards(ClerkAuthGuard)` and make it admin-only, OR protect with internal HMAC key (like `internal-push.controller.ts` pattern), OR move to a NestJS cron job (`@Cron`).

```typescript
// VULNERABLE:
@Post('publish-overdue')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Auto-publish all overdue scheduled content (internal/cron)' })
publishOverdue() {
  return this.schedulingService.publishOverdueContent();
}
```

### X05-F02: `POST webhooks/:token/execute` (Discord) — NO AUTH GUARD [HIGH]

**File:** `apps/api/src/modules/discord-features/discord-features.controller.ts:132`
**Endpoint:** `POST /api/v1/webhooks/:token/execute`
**Current state:** No `@UseGuards(ClerkAuthGuard)`. Relies on webhook token only.
**Impact:** This is intentionally public (external webhook execution by token), but the only protection is the token itself. If tokens are guessable or leaked, anyone can inject messages into circles.
**Severity:** HIGH (by design, but needs hardening)
**Fix:** Token-based auth is acceptable for webhooks, but add:
1. HMAC signature verification (like Stripe/Clerk webhooks)
2. IP allowlist option per webhook
3. Token rotation capability
4. The 30/min throttle is present, which helps

### X05-F03: `POST internal/e2e/identity-changed` — NO ClerkAuthGuard (by design) [INFO]

**File:** `apps/api/src/modules/messages/internal-e2e.controller.ts:35`
**Current state:** Uses HMAC-SHA256 signature verification instead of Clerk auth.
**Assessment:** CORRECT. This is a server-to-server endpoint from Go E2E server. HMAC verification is appropriate. Has 5/min throttle. No finding.

### X05-F04: `POST internal/push-to-users` — NO ClerkAuthGuard (by design) [INFO]

**File:** `apps/api/src/modules/notifications/internal-push.controller.ts:58`
**Current state:** Uses `X-Internal-Key` header with timing-safe comparison.
**Assessment:** CORRECT. Server-to-server from Go LiveKit server. Has 30/min throttle. No finding.

---

## HIGH FINDINGS

### X05-F05: Stripe Webhook uses `@SkipThrottle()` [HIGH]

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts:30`
**Endpoint:** `POST /api/v1/payments/webhooks/stripe`
**Current state:** `@SkipThrottle()` at class level. Stripe signature verification is the only protection.
**Impact:** During a webhook replay attack or a compromised Stripe integration, there's no rate limit to prevent flood of webhook events. The Redis-based idempotency check (`stripe:event:${event.id}`) helps for exact duplicates, but not for high-volume unique events.
**Severity:** HIGH
**Fix:** Replace `@SkipThrottle()` with a generous but finite limit: `@Throttle({ default: { limit: 200, ttl: 60000 } })`. Stripe sends bursts during bulk operations but 200/min is more than enough.

### X05-F06: `POST stream/webhook` — NO AUTH GUARD [MEDIUM]

**File:** `apps/api/src/modules/stream/stream.controller.ts:36`
**Endpoint:** `POST /api/v1/stream/webhook`
**Current state:** No ClerkAuthGuard (correct for webhook). Uses HMAC signature verification with `CF_STREAM_WEBHOOK_SECRET`.
**Assessment:** Properly authenticated via HMAC. Has class-level 60/min throttle. Acceptable.

### X05-F07: `POST webhooks/clerk` — NO AUTH GUARD [INFO]

**File:** `apps/api/src/modules/auth/webhooks.controller.ts:70`
**Endpoint:** `POST /api/v1/webhooks/clerk`
**Current state:** No ClerkAuthGuard (correct for webhook). Uses Svix signature verification.
**Assessment:** Properly authenticated. Has 50/min throttle. Acceptable.

---

## UNGUARDED MUTATIONS — COMPLETE LIST

All endpoints below lack `@UseGuards(ClerkAuthGuard)` at both class and method level:

| # | Controller | Endpoint | Auth Method | Throttle | Verdict |
|---|-----------|----------|-------------|----------|---------|
| 1 | `scheduling` | `POST publish-overdue` | **NONE** | Global 100/min only | **CRITICAL — must fix** |
| 2 | `discord-features` | `POST webhooks/:token/execute` | Token in URL | 30/min | Acceptable (webhook pattern) |
| 3 | `internal-e2e` | `POST identity-changed` | HMAC-SHA256 header | 5/min | Correct |
| 4 | `internal-push` | `POST push-to-users` | X-Internal-Key header | 30/min | Correct |
| 5 | `stripe-webhook` | `POST stripe` | Stripe signature | **SkipThrottle** | Needs throttle cap |
| 6 | `stream` | `POST webhook` | HMAC signature | 60/min | Correct |
| 7 | `auth/webhooks` | `POST clerk` | Svix signature | 50/min | Correct |
| 8 | `waitlist` | `POST join` | **NONE** | 5/min | Correct — public endpoint |

---

## THROTTLE COVERAGE — MUTATIONS WITHOUT EXPLICIT @Throttle

These endpoints rely on either class-level throttle or the global 100/min default. For mutations that modify data, 100/min may be too permissive.

### Category A: Relying on class-level @Throttle (acceptable — inherits controller limit)

| Controller | Class-Level Limit | Endpoints Inheriting |
|-----------|-------------------|---------------------|
| `admin` | 30/min | `PATCH reports/:id`, `POST users/:id/ban`, `POST users/:id/unban`, `PATCH flags/:name`, `DELETE flags/:name` |
| `blocks` | 30/min | `POST :userId`, `DELETE :userId` |
| `bookmarks` | 30/min | All 8 mutations |
| `circles` | 60/min | `PUT :id`, `DELETE :id`, `POST :id/members`, `DELETE :id/members` |
| `collabs` | 30/min | All 4 mutations |
| `downloads` | 60/min | All 3 mutations |
| `follows` | 30/min | All 6 mutations |
| `messages` | 60/min | ~30 mutations (most are fine, but see Category C) |
| `mutes` | 30/min | `POST :userId`, `DELETE :userId` |
| `notifications` | 60/min | `POST :id/read`, `POST read-all`, `DELETE :id` |
| `parental-controls` | 30/min | `POST link`, `DELETE link/:childId`, `PATCH :childId`, `PATCH :childId/pin` |
| `payments` | 60/min | (but all mutations have method-level 10/min override) |
| `privacy` | 60/min | (but `DELETE delete-all` has 1/day override) |
| `profile-links` | 60/min | All 4 mutations |
| `reports` | 60/min | All 3 mutations |
| `restricts` | 30/min | `POST :userId`, `DELETE :userId` |
| `retention` | 30/min | `POST session-depth` |
| `settings` | 60/min | All 9 mutations |
| `telegram-features` | 30/min | ~15 mutations |
| `watch-history` | 60/min | All 5 mutations |
| `webhooks` (community) | 20/min | All 3 mutations |
| `chat-export` | 5/hr | `POST :convId` |
| `alt-profile` | 60/min | All 5 mutations |
| `video-replies` | 60/min | `POST`, `DELETE :id` |

### Category B: Relying on global 100/min default ONLY (no class or method @Throttle)

These controllers have NO `@Throttle` at class or method level. They get only the global 100 req/min:

| Controller | Endpoints Affected | Risk |
|-----------|-------------------|------|
| `two-factor` | None — all methods have method-level @Throttle | OK |
| `events` | None — all mutations have method-level @Throttle | OK |
| `live` | All 19 mutations | **MEDIUM** — 100/min for live stream actions is too permissive |
| `promotions` | 4 of 5 mutations (`POST :id/cancel`, `POST reminder`, `DELETE reminder/:postId`, `POST branded`) | **MEDIUM** — boost/branded content creation needs tighter limits |
| `thumbnails` | `POST variants` (no throttle, no class-level) | **LOW** — authenticated, but no explicit limit |

### Category C: Mutations where 100/min or class-level limit is too permissive [FINDINGS]

| # | Finding | Controller | Endpoint | Current Limit | Recommended |
|---|---------|-----------|----------|--------------|-------------|
| F08 | Too permissive | `live` | `POST /live` (create) | 100/min (global) | 5/min |
| F09 | Too permissive | `live` | `POST /live/:id/chat` | 100/min (global) | 30/min |
| F10 | Too permissive | `live` | `POST /live/:id/raise-hand` | 100/min (global) | 10/min |
| F11 | Too permissive | `live` | `POST /live/rehearse` | 100/min (global) | 5/min |
| F12 | Too permissive | `promotions` | `POST /promotions/branded` | 100/min (global) | 5/min |
| F13 | Too permissive | `promotions` | `POST /promotions/reminder` | 100/min (global) | 10/min |
| F14 | Too permissive | `promotions` | `POST /promotions/:id/cancel` | 100/min (global) | 10/min |
| F15 | Too permissive | `thumbnails` | `POST /thumbnails/variants` | 100/min (global) | 10/min |
| F16 | Too permissive | `islamic` | `POST /islamic/hadiths/:id/bookmark` | 30/min (class) | OK (class is fine) |
| F17 | Too permissive | `islamic` | `POST /islamic/hajj/progress` | 30/min (class) | 10/min |
| F18 | Too permissive | `islamic` | `POST /islamic/dhikr/sessions` | 30/min (class) | 10/min |
| F19 | Too permissive | `islamic` | `POST /islamic/fasting/log` | 30/min (class) | 10/min |
| F20 | Too permissive | `islamic` | `POST /islamic/daily-tasks/complete` | 30/min (class) | 10/min |
| F21 | Too permissive | `islamic` | `POST /islamic/classify-content` | 30/min (class) | 5/min (AI cost) |
| F22 | Too permissive | `islamic` | `POST /islamic/detect-hadith-grade` | 30/min (class) | 5/min (AI cost) |
| F23 | Too permissive | `drafts` | `PATCH :id`, `DELETE :id`, `DELETE` (all) | 100/min (global) | 30/min |
| F24 | Too permissive | `checklists` | `PATCH items/:itemId/toggle`, `DELETE items/:itemId`, `DELETE :checklistId` | 100/min (global) | 30/min |
| F25 | Missing override | `halal` | `POST :id/reviews` | 30/min (class) | 5/min (review spam) |
| F26 | Missing override | `halal` | `POST :id/verify` | 30/min (class) | 3/min (verification spam) |
| F27 | Too permissive | `upload` | `DELETE :key(*)` | 100/min (global) | 20/min |
| F28 | Too permissive | `community-notes` | `POST :noteId/rate` | 100/min (global, no class throttle on this endpoint) | 30/min |
| F29 | Too permissive | `devices` | `DELETE sessions/:id` | 60/min (class) | 10/min (session logout) |
| F30 | Too permissive | `devices` | `POST sessions/logout-others` | 60/min (class) | 5/min |

---

## @ApiBearerAuth COVERAGE

Controllers with `@UseGuards(ClerkAuthGuard)` at class or method level but MISSING `@ApiBearerAuth()`:

| Controller | Class-Level @ApiBearerAuth | Method-Level Missing |
|-----------|--------------------------|---------------------|
| `reels` | YES at class | Individual methods missing on `DELETE :id`, `POST :id/like`, `DELETE :id/like`, etc. — OK, class-level covers Swagger |
| `polls` | NO class-level | `POST :id/vote` and `DELETE :id/vote` missing — Swagger won't show auth header |
| `community-notes` | YES at class | `POST :noteId/rate` missing — OK, class covers |
| `scheduling` | NO class-level | Guarded methods have method-level `@ApiBearerAuth()` — OK |
| `thumbnails` | NO class-level | `POST impression` and `POST click` missing — Swagger won't show auth |
| `halal` | YES at class | OK |

**Impact:** Missing `@ApiBearerAuth()` is Swagger UI only — does not affect runtime security. Low priority.

---

## WEBHOOK AUTHENTICATION AUDIT

| Webhook | Auth Method | Signature Algo | Throttle | Verdict |
|---------|-----------|---------------|----------|---------|
| `POST /webhooks/clerk` | Svix SDK verification | Ed25519 (Svix) | 50/min | GOOD |
| `POST /payments/webhooks/stripe` | `stripe.webhooks.constructEvent()` | HMAC-SHA256 | **SkipThrottle** | NEEDS CAP |
| `POST /stream/webhook` | Custom HMAC verify | HMAC-SHA256 | 60/min | GOOD |
| `POST /internal/e2e/identity-changed` | Custom HMAC verify (rawBody) | HMAC-SHA256 | 5/min | GOOD |
| `POST /internal/push-to-users` | `X-Internal-Key` timing-safe compare | Raw key comparison | 30/min | ACCEPTABLE |
| `POST /webhooks/:token/execute` | Token in URL param | None (token = auth) | 30/min | NEEDS HARDENING |

---

## INTERNAL ENDPOINT PROTECTION

| Endpoint | Purpose | Auth | Exposed to Public? | Risk |
|----------|---------|------|-------------------|------|
| `POST /internal/e2e/identity-changed` | Go E2E server webhook | HMAC | Yes (but verified) | LOW |
| `POST /internal/push-to-users` | Go LiveKit server push | Key header | Yes (but verified) | LOW |
| **`POST /scheduling/publish-overdue`** | Cron auto-publish | **NONE** | **YES** | **CRITICAL** |

---

## COMPLETE MUTATION INVENTORY BY CONTROLLER

### Controllers with FULL coverage (class-level guard + throttle, all methods protected):

1. **admin** — ClerkAuthGuard + 30/min class + method overrides on sensitive endpoints
2. **ai** — Method-level ClerkAuthGuard + method-level Throttle on every endpoint (5-30/min)
3. **alt-profile** — ClerkAuthGuard + 60/min class
4. **audio-rooms** — Method-level ClerkAuthGuard + method-level Throttle (5-10/min) on every endpoint
5. **audio-tracks** — Method-level ClerkAuthGuard + 60/min class
6. **auth** — Method-level ClerkAuthGuard + method-level Throttle (5/5min, 10/min)
7. **blocks** — ClerkAuthGuard + 30/min class
8. **bookmarks** — ClerkAuthGuard + 30/min class
9. **broadcast** — Method-level ClerkAuthGuard + 30/min class + 5/min create override
10. **channel-posts** — Method-level ClerkAuthGuard + 30/min class
11. **channels** — Method-level ClerkAuthGuard + method-level Throttle
12. **chat-export** — ClerkAuthGuard + 5/hr class
13. **checklists** — ClerkAuthGuard class + method-level Throttle on create (20/min, 30/min)
14. **circles** — ClerkAuthGuard + 60/min class + 10/min create
15. **clips** — Method-level ClerkAuthGuard + 60/min class
16. **collabs** — ClerkAuthGuard + 30/min class
17. **commerce** — Method-level ClerkAuthGuard + 30/min class + method overrides
18. **communities** — Method-level ClerkAuthGuard + method-level Throttle 10/min
19. **community** — Method-level ClerkAuthGuard + 30/min class + method overrides
20. **community-notes** — Method-level ClerkAuthGuard + method-level Throttle
21. **creator** — ClerkAuthGuard class + 20/hr Throttle on ask
22. **devices** — ClerkAuthGuard class + 60/min class + TwoFactorGuard on sensitive
23. **discord-features** — Method-level ClerkAuthGuard + 30/min class + method overrides
24. **downloads** — ClerkAuthGuard + 60/min class
25. **drafts** — ClerkAuthGuard class + 30/min on create
26. **embeddings** — ClerkAuthGuard + 5/min class
27. **events** — Method-level ClerkAuthGuard + method-level Throttle 10/min on all mutations
28. **feed** — Method-level ClerkAuthGuard + method-level Throttle (10-60/min)
29. **follows** — ClerkAuthGuard + 30/min class
30. **gamification** — Method-level ClerkAuthGuard + class 30/min + method overrides
31. **gifts** — ClerkAuthGuard + 60/min class + method overrides (10/30/5)
32. **halal** — Method-level ClerkAuthGuard + 30/min class (needs tighter per-method)
33. **hashtags** — Method-level ClerkAuthGuard + 60/min class
34. **islamic** — Method-level ClerkAuthGuard + 30/min class (needs tighter per-method on AI endpoints)
35. **majlis-lists** — Method-level ClerkAuthGuard + 60/min class
36. **messages** — ClerkAuthGuard + 60/min class + method overrides on key endpoints
37. **moderation** — ClerkAuthGuard + 30/min class + 5/min on check endpoints
38. **monetization** — Method-level ClerkAuthGuard + 30/min class + 10/min method overrides
39. **mosques** — Method-level ClerkAuthGuard + per-method Throttle
40. **mutes** — ClerkAuthGuard + 30/min class
41. **notifications** — ClerkAuthGuard + 60/min class
42. **parental-controls** — ClerkAuthGuard + 30/min class + 3/5min on PIN
43. **payments** — ClerkAuthGuard + 60/min class + 10/min on all mutations
44. **playlists** — Method-level ClerkAuthGuard + method-level Throttle 5/min
45. **polls** — Method-level ClerkAuthGuard + 10/min on vote
46. **posts** — Method-level ClerkAuthGuard + method-level Throttle (10-30/min)
47. **privacy** — ClerkAuthGuard + 60/min class + 1/day on delete-all
48. **profile-links** — ClerkAuthGuard + 60/min class
49. **reel-templates** — Method-level ClerkAuthGuard + 60/min class
50. **reels** — Method-level ClerkAuthGuard + method-level Throttle (5-30/min)
51. **reports** — ClerkAuthGuard + 60/min class
52. **restricts** — ClerkAuthGuard + 30/min class
53. **retention** — ClerkAuthGuard + 30/min class
54. **scholar-qa** — Method-level ClerkAuthGuard + method-level Throttle (5-20/min)
55. **settings** — ClerkAuthGuard + 60/min class
56. **stickers** — Method-level ClerkAuthGuard + method-level Throttle 5/min on create
57. **stories** — Method-level ClerkAuthGuard + method-level Throttle (10-30/min)
58. **story-chains** — Method-level ClerkAuthGuard + 60/min class
59. **subtitles** — Method-level ClerkAuthGuard + 60/min class
60. **telegram-features** — ClerkAuthGuard + 30/min class + method overrides
61. **threads** — Method-level ClerkAuthGuard + method-level Throttle (10-30/min)
62. **two-factor** — Method-level ClerkAuthGuard + method-level Throttle (5-10/min)
63. **upload** — ClerkAuthGuard class + method-level Throttle (20/min)
64. **users** — Method-level ClerkAuthGuard + 60/min class + TwoFactorGuard on destructive
65. **video-replies** — Method-level ClerkAuthGuard + 60/min class
66. **videos** — Method-level ClerkAuthGuard + method-level Throttle (3-30/min)
67. **waitlist** — Public (correct) + 5/min Throttle
68. **watch-history** — ClerkAuthGuard + 60/min class

### Controllers with ISSUES:

69. **scheduling** — `publish-overdue` UNGUARDED (CRITICAL)
70. **live** — All 19 mutations guarded but NO class or method @Throttle (relies on global 100/min)
71. **promotions** — Guarded but 4/5 mutations lack explicit @Throttle
72. **thumbnails** — `POST variants` has no throttle (global 100/min only)

### Controllers that are webhooks/internal (correctly unguarded):

73. **auth/webhooks** — Svix signature verification
74. **stripe-webhook** — Stripe signature (but @SkipThrottle is dangerous)
75. **stream** — HMAC signature verification
76. **internal-e2e** — HMAC signature verification
77. **internal-push** — Key header verification

### Controllers with no mutations (read-only):

78. **feed** (GET endpoints) — OptionalClerkAuthGuard on public feeds
79. **giphy** — GET only (search/trending)
80. **health** — GET only
81. **legal** — GET only
82. **og** — GET only (OpenGraph previews)
83. **recommendations** — GET only
84. **search** — GET only

---

## FINDINGS SUMMARY BY SEVERITY

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| **CRITICAL** | 1 | F01 (publish-overdue unguarded) |
| **HIGH** | 2 | F02 (discord webhook token-only), F05 (Stripe SkipThrottle) |
| **MEDIUM** | 15 | F08-F15, F23-F24, F25-F26, F27, F29-F30 (throttle too permissive) |
| **LOW** | 8 | F16-F22, F28 (could use tighter throttle but class-level is reasonable) |
| **INFO** | 5 | F03, F04, F06, F07 (correct by design), @ApiBearerAuth gaps |

**Total findings: 31**

---

## ACTIONABLE FIX LIST (ordered by priority)

### Must Fix Before Launch

1. **F01** — Add auth to `POST /scheduling/publish-overdue`. Either:
   - Add HMAC key verification (like internal-push pattern), OR
   - Convert to `@Cron()` job inside NestJS, OR
   - Add admin-only guard (ClerkAuthGuard + role check)

2. **F05** — Replace `@SkipThrottle()` on Stripe webhook with `@Throttle({ default: { limit: 200, ttl: 60000 } })`

### Should Fix

3. **F08-F11** — Add `@Throttle({ default: { limit: 30, ttl: 60000 } })` at class level on `live.controller.ts`
4. **F12-F14** — Add `@Throttle` on remaining `promotions` mutations (5-10/min)
5. **F15** — Add `@Throttle({ default: { limit: 10, ttl: 60000 } })` on `thumbnails.variants`
6. **F21-F22** — Tighten `islamic` AI endpoints to 5/min (cost control)
7. **F25-F26** — Tighten `halal` review/verify to 5/min and 3/min
8. **F29-F30** — Tighten `devices` session logout to 10/min and 5/min

### Nice to Have

9. **F02** — Add HMAC signature verification to discord webhook execute endpoint
10. **F23-F24, F27-F28** — Tighten misc endpoints from global 100/min to 30/min
11. Add `@ApiBearerAuth()` to `polls`, `thumbnails` controllers for Swagger completeness
