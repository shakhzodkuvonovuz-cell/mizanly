# A35 — Cross-Module Security Findings (All 6 Module Groups)

**Auditor:** Opus 4.6 | **Date:** 2026-04-05 | **Scope:** Cross-cutting findings across islamic, halal, live, broadcast, privacy, settings, scheduling, drafts

> Note: Per-module detailed findings are in A31 (islamic+halal), A33 (live+broadcast), A36 (privacy+settings), A38 (scheduling+drafts). This file covers patterns that span multiple modules.

---

## Cross-Module Pattern Analysis

### P1: Inconsistent auth guard strategy across modules

| Module | Class-level Guard | Write Protection |
|--------|-------------------|-----------------|
| Islamic | `OptionalClerkAuthGuard` | Per-method `ClerkAuthGuard` |
| Halal | None (per-method) | `ClerkAuthGuard` on POST |
| Live | None (per-method) | `ClerkAuthGuard` on mutations |
| Broadcast | None (class-level `@Throttle` only) | `ClerkAuthGuard` on mutations |
| Privacy | `ClerkAuthGuard` (class-level) | Inherits from class |
| Settings | `ClerkAuthGuard` (class-level) | Inherits from class |
| Scheduling | None | Per-method `ClerkAuthGuard` (EXCEPT `publishOverdue`) |
| Drafts | `ClerkAuthGuard` (class-level) | Inherits from class |

**Finding:** Three modules (Privacy, Settings, Drafts) use class-level ClerkAuthGuard which is the safest pattern. Scheduling module has the critical gap where `publishOverdue` is unprotected.
**Severity:** Covered in A38-C1 (CRITICAL).

### P2: Blocked-user filtering is absent across ALL audited modules

None of the 8 modules check for blocked-user relationships:
- **Halal reviews:** Blocked user's reviews visible to blocker
- **Live sessions:** Blocked users can join live sessions hosted by the blocker
- **Broadcast channels:** Blocked users can subscribe to and view messages from the blocker's channel
- **Dhikr leaderboard:** Blocked users appear on each other's leaderboards
- **Charity campaigns:** Blocked user's campaigns visible to blocker

**Severity:** MEDIUM — Not a data leak but violates user expectations of block behavior.

### P3: Location privacy concerns across halal + mosque + live modules

| Endpoint | Location Data | Exposure |
|----------|--------------|----------|
| `GET /halal/restaurants?lat=X&lng=Y` | User's live GPS coordinates sent as query params | Logged in server logs, Cloudflare WAF logs |
| `GET /islamic/mosques?lat=X&lng=Y` | User's live GPS coordinates | Same |
| `POST /islamic/mosques/follow` | User's preferred mosque coordinates | Stored in Redis `user:mosque:{userId}` indefinitely |
| `GET /islamic/daily-briefing?lat=X&lng=Y` | User's morning location | Logged |
| `GET /islamic/ramadan?lat=X&lng=Y` | User's location | Logged |

**Finding:** User GPS coordinates flow through query parameters to multiple Islamic endpoints. These coordinates appear in:
1. Server access logs (if enabled)
2. Cloudflare WAF/analytics logs (retained 72h-30d depending on plan)
3. Redis (for mosque follow — no TTL)
4. Sentry breadcrumbs (if request URL is captured)

There is no coordinate rounding at the API gateway level. The prayer times endpoint rounds to 2 decimal places for caching (line 221 of islamic.service.ts) but the raw coordinates still flow to the Aladhan API and Overpass API.

**Severity:** MEDIUM — GPS coordinates in query strings are a privacy anti-pattern. Consider POST bodies or coordinate rounding at ingress.

### P4: Rate limiting inconsistencies

| Operation | Rate Limit | Risk |
|-----------|-----------|------|
| Prayer times | 30/min (class default) | OK |
| Mosque search (hits Overpass API) | 30/min (class default) | Overpass API abuse |
| Quran search | 30/min (class default) | Search abuse |
| Live create | 3/hour | Good |
| Live chat | 60/min | OK |
| Broadcast send | 30/min | OK |
| Scholar verification | 1/day | Good |
| GDPR export | 2/hour | OK (but OOM risk) |
| GDPR delete | 1/day | OK |
| Halal find nearby | 30/min | OK |
| Draft create | 30/min | Allows 43K drafts/day |
| Scheduling publish-overdue | **NONE** | **CRITICAL** (unauthenticated) |

### P5: Error handling patterns

All modules follow the pattern of throwing NestJS HTTP exceptions (NotFoundException, BadRequestException, ForbiddenException, ConflictException). No raw errors leak to clients. The global exception filter handles unexpected errors.

However, two concerning patterns:
1. **Halal service** (line 178-181): Catches Prisma P2002 error by checking `err.code` via cast — fragile but functional
2. **Live service** (line 167): Catches stream creation error with empty catch block — silently continues without stream capability

### P6: Pagination pattern inconsistencies

| Module | Endpoint | Pagination Type | Sort Key | Correct? |
|--------|----------|----------------|----------|----------|
| Halal findNearby | offset-based | distance (app-side sort) | NO — inconsistent pages |
| Halal getReviews | Prisma cursor (id) | createdAt desc | YES |
| Live getActive | Prisma cursor (id) | currentViewers desc | RISKY — non-unique sort |
| Live getScheduled | Prisma cursor (id) | scheduledAt asc | RISKY — ties possible |
| Broadcast getMessages | id < cursor | createdAt desc | NO — id order != time order |
| Broadcast discover | Prisma cursor (id) | subscribersCount desc | RISKY — non-unique sort |
| Broadcast getSubscribers | Composite cursor (joinedAt:userId) | joinedAt desc, userId desc | YES — well done |
| Islamic readingPlanHistory | Prisma cursor (id) | createdAt desc | RISKY |
| Islamic campaigns | Prisma cursor (id) | createdAt desc | RISKY |
| Scheduling getScheduled | None (limit 50 per type) | scheduledAt asc | OK — capped |
| Drafts getDrafts | None (limit 50) | updatedAt desc | OK — capped |

**Finding:** Only `broadcast.getSubscribers` uses a truly correct composite cursor. Most others use Prisma cursor with id + non-correlated sort key, which can produce skips/duplicates under concurrent writes.
**Severity:** LOW-MEDIUM — Correctness issue, not security.

---

## Consolidated Finding Counts (All Files)

| File | CRITICAL | HIGH | MEDIUM | LOW | INFO | PASS |
|------|----------|------|--------|-----|------|------|
| A31 (Islamic+Halal) | 0 | 0 | 4 | 6 | 4 | 0 |
| A33 (Live+Broadcast) | 0 | 1 | 5 | 5 | 2 | 3 |
| A36 (Privacy+Settings) | 0 | 2 | 2 | 5 | 2 | 3 |
| A38 (Scheduling+Drafts) | 1 | 1 | 4 | 5 | 0 | 1 |
| A35 (Cross-module) | — | — | — | — | — | — |
| **TOTAL** | **1** | **4** | **15** | **21** | **8** | **7** |

---

## Top 5 Findings Requiring Immediate Fix

| # | ID | Severity | Module | Issue |
|---|-----|----------|--------|-------|
| 1 | A38-C1 | CRITICAL | Scheduling | `POST /scheduling/publish-overdue` has no auth guard — any user can trigger bulk publish |
| 2 | A38-C5 | HIGH | Drafts | `publishDraft` bypasses content moderation, search indexing, gamification, notifications |
| 3 | A33-C1 | HIGH | Live | `getById` exposes `recordingUrl` to unauthenticated users |
| 4 | A36-C1 | HIGH | Privacy | GDPR export loads ~30 tables into memory at once — OOM for power users |
| 5 | A36-C2 | HIGH | Privacy | GDPR delete uses ~80-operation transaction — timeout risk |

---

## Top 5 Findings Requiring Short-term Fix

| # | ID | Severity | Module | Issue |
|---|-----|----------|--------|-------|
| 6 | A33-C5 | MEDIUM | Live | Banned/blocked users can join live sessions |
| 7 | A36-C10 | MEDIUM | Privacy | Clerk session not revoked after account deletion |
| 8 | A33-C16 | MEDIUM | Live | Recording URL accepts arbitrary domain — phishing vector |
| 9 | A38-C9 | MEDIUM | Scheduling | `publishNow` fires duplicate side effects on already-published content |
| 10 | A31-C7 | MEDIUM | Islamic | `user:mosque:{userId}` Redis key not cleaned on GDPR delete |
