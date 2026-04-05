# A32: Polls, Hashtags & OG Audit

**Auditor:** Claude Opus 4.6 (hostile mode)
**Date:** 2026-04-05
**Scope:** `apps/api/src/modules/polls/`, `apps/api/src/modules/hashtags/`, `apps/api/src/modules/og/`
**Files reviewed:** 18 files, ~1,700 lines of source code (excluding tests)

---

## Findings

### [CRITICAL] A32-01 — OG Unfurl: No Response Body Size Limit (Memory Exhaustion DoS)

**File:** `apps/api/src/modules/og/og.service.ts`, line 317
**Code:** `const html = await response.text();`

The `fetchUrlMetadata` method fetches an external URL and reads the entire response body into memory with `response.text()`. There is no `Content-Length` check or streaming limit. An attacker can supply a URL that serves an infinitely large or multi-GB response (e.g., `https://attacker.com/huge.html` returning 10 GB of data). This would exhaust the Node.js process heap memory, crashing the server.

The `AbortSignal.timeout(5000)` at line 306 only limits the connection timeout, not the total data transfer. A slow-drip server sending 1 byte per millisecond would keep the connection alive indefinitely while buffering unlimited data.

**Impact:** Denial of Service — any unauthenticated user can crash the API server.
**Fix:** Read the response as a stream, enforce a max body size (e.g., 1 MB), abort if exceeded. Example: read chunks in a loop, sum bytes, abort when threshold hit.

---

### [CRITICAL] A32-02 — OG Unfurl: Unauthenticated Endpoint Allows Open Proxy Abuse

**File:** `apps/api/src/modules/og/og.controller.ts`, lines 52-63

The `/og/unfurl` endpoint has no `@UseGuards(ClerkAuthGuard)` or `@UseGuards(OptionalClerkAuthGuard)`. It is completely unauthenticated. While it has `@Throttle({ limit: 30, ttl: 60000 })`, the global `UserThrottlerGuard` throttles by IP. Behind a CDN or with rotating IPs, an attacker can use this endpoint as an open HTTP proxy to:

1. Probe internal services that passed SSRF validation (any public IP)
2. Abuse Mizanly's IP reputation to make requests to third-party services
3. Amplify DDoS against target sites (30 req/min/IP * thousands of IPs)
4. Scrape arbitrary websites using Mizanly as a proxy

**Impact:** Server abuse, IP reputation damage, potential legal liability for proxied attacks.
**Fix:** Require authentication (`ClerkAuthGuard`). Only authenticated users should be able to trigger server-side fetches. Reduce rate limit further (10 req/min per user).

---

### [HIGH] A32-03 — OG Unfurl: ReDoS in HTML Meta Tag Parsing

**File:** `apps/api/src/modules/og/og.service.ts`, lines 321-331

The `getMetaContent` function constructs four regex patterns per property name and runs them against the full HTML body. The patterns use `[^"']*` which is fine, but the `property` parameter is injected directly into the regex without escaping:

```typescript
new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']*)["']`, 'i'),
```

While `property` is currently only called with hardcoded strings (`og:title`, `twitter:title`, etc.), this is a fragile design. More critically, these regexes are executed 4 times each for 6 different property lookups (24 regex executions) against potentially multi-MB HTML strings (see A32-01). Even with well-behaved input, this is O(24 * N) where N is the HTML size.

**Impact:** CPU exhaustion on large HTML documents; potential ReDoS if property names ever become user-controlled.
**Fix:** Use a proper HTML parser (e.g., `cheerio` or `htmlparser2` which is already popular in the Node ecosystem) or at minimum truncate the HTML to the first 50KB (the `<head>` section where OG tags live) before regex matching.

---

### [HIGH] A32-04 — Poll Vote: TOCTOU Race Condition on Multi-Choice Limit

**File:** `apps/api/src/modules/polls/polls.service.ts`, lines 107-129

For multi-choice polls (`allowMultiple: true`), there is no limit on how many options a user can vote on. The code checks if the user already voted on the specific option (line 123), but doesn't cap the total number of votes per user. A user with a multi-choice poll of 100 options can vote on all 100, each incrementing `totalVotes` by 1.

More critically, there's a TOCTOU race between the `findFirst` check (line 107) and the `$transaction` create (line 134). Two concurrent requests can both pass the duplicate check and both succeed in the transaction. The `P2002` catch on line 159 handles this for the `userId_optionId` unique constraint, but for multi-choice polls where the user votes on different options simultaneously, all concurrent votes will succeed without any rate limiting on the total number of votes per user per poll.

**Impact:** Vote inflation — a user can cast unlimited votes on a multi-choice poll by voting on every option. No `maxChoices` enforcement exists.
**Fix:** Add a `maxChoices` field to the Poll model. In the vote method, count existing votes and reject if `maxChoices` is reached. Do this inside the transaction.

---

### [HIGH] A32-05 — Hashtag Trending Query: Catastrophic Performance (4 Correlated Subqueries per Row)

**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 156-188

The `fetchTrendingHashtags` raw SQL query performs 8 correlated subqueries (4 in SELECT, 4 repeated in WHERE) for every row in the `hashtags` table. Each subquery does a sequential scan with `@>` array contains on `posts`, `reels`, `threads`, and `videos` tables filtered by 7-day window.

For a database with 10K hashtags, 1M posts, 500K reels, 200K threads, and 100K videos, this query will perform approximately 80K sequential scans (10K hashtags * 8 subqueries). Even with the 5-minute cache (`cacheAside`), the first request after cache expiry will take potentially 30+ seconds and lock database resources.

The `@>` array containment operator on `hashtags` column (a `String[]` field) does not use GIN indexes unless explicitly created. There's no evidence of a GIN index on `posts.hashtags`, `reels.hashtags`, `threads.hashtags`, or `videos.tags`.

**Impact:** Database DoS on cache miss. Slow trending page load. Potential connection pool exhaustion.
**Fix:** 
1. Create GIN indexes: `CREATE INDEX idx_posts_hashtags_gin ON posts USING gin(hashtags);` (and for reels, threads, videos).
2. Pre-compute trending counts in a materialized view or a scheduled background job (every 5 minutes) rather than computing on-the-fly.
3. Add a query timeout (`statement_timeout`) on this specific raw query.

---

### [MEDIUM] A32-06 — Poll: No Close/Edit Endpoint — No BOLA Risk but Missing Functionality

**File:** `apps/api/src/modules/polls/polls.controller.ts` (entire file)

There is no endpoint to close a poll early or edit poll options. The only way a poll expires is via the `endsAt` DateTime set at creation time. This means:

1. If a poll creator needs to close a poll early (e.g., inappropriate options discovered), they cannot.
2. If `endsAt` was not set at creation, the poll is open forever with no way to close it.
3. The thread (parent) deletion cascades to delete the poll, but there's no dedicated close mechanism.

Since there's no edit/close endpoint, there's no BOLA vulnerability here — the attack surface doesn't exist. But this is a functional gap.

**Impact:** Missing functionality. Polls without `endsAt` are immortal.
**Fix:** Add a `POST /polls/:id/close` endpoint with ownership check (thread.userId === currentUser).

---

### [MEDIUM] A32-07 — OG Unfurl: Cache Poisoning via URL Normalization

**File:** `apps/api/src/modules/og/og.service.ts`, line 281

The cache key is the raw URL string: `og:unfurl:${url}`. URLs can be semantically identical but syntactically different:
- `https://example.com` vs `https://example.com/` vs `https://EXAMPLE.COM`
- `https://example.com/page?a=1&b=2` vs `https://example.com/page?b=2&a=1`

An attacker can bypass the cache by varying URL casing, trailing slashes, or query parameter order, forcing repeated external fetches and filling Redis with duplicate entries.

More critically, if an attacker can manipulate the response of a URL (e.g., via DNS rebinding window or a site they control), they can poison the cache for 1 hour (the `UNFURL_CACHE_TTL`). Subsequent legitimate users requesting the same URL will get the poisoned metadata.

**Impact:** Cache bypass causes amplified external requests. Cache poisoning shows attacker-controlled metadata for 1 hour.
**Fix:** Normalize URLs before caching: lowercase hostname, sort query parameters, remove default ports, normalize trailing slashes. Consider using `url.href` after parsing with `new URL()`.

---

### [MEDIUM] A32-08 — Hashtag Search: No Input Sanitization on `startsWith` Query

**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, line 193

The `search` method passes the raw `query` string directly to Prisma's `startsWith` filter. While Prisma parameterizes queries (preventing SQL injection), there's no sanitization of the hashtag search input:

1. `SearchQueryDto` has `@MaxLength(100)` but no regex pattern validation
2. Special characters like `%`, `_` (SQL LIKE wildcards) are passed through — Prisma's `startsWith` with `mode: 'insensitive'` translates to `ILIKE 'query%'`. If `query` contains `%`, it becomes `ILIKE '%%'` which matches everything
3. Unicode control characters, zero-width characters, and RTL override characters can be stored/searched

**Impact:** Wildcard injection allows listing all hashtags (information disclosure). Unicode tricks can create visually identical but different hashtags.
**Fix:** Strip SQL LIKE special characters (`%`, `_`) from the search query. Add a regex validation pattern to `SearchQueryDto`: `@Matches(/^[\w\u0600-\u06FF\u0750-\u077F]+$/)` (alphanumeric + Arabic).

---

### [MEDIUM] A32-09 — Hashtag Counter Drift: Non-Atomic Decrement + Floor Creates Permanent Inaccuracy

**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 333-347

The `decrementCount` method uses two separate queries:
1. `prisma.hashtag.update` to decrement the count (line 335)
2. `prisma.hashtag.updateMany` to floor at 0 if negative (line 341)

These are not in a transaction. Between step 1 and step 2, another `incrementCount` could execute, creating a race condition:
- Count starts at 1
- Thread A: decrement → count becomes 0
- Thread B: increment → count becomes 1  
- Thread A: floor check (count >= 0) → no-op
- Result: correct by luck

But consider:
- Count starts at 0
- Thread A: decrement → count becomes -1
- Thread B: increment → count becomes 0
- Thread A: floor check (count < 0 is false now) → no-op
- Result: count is 0 when it should be 1

The `incrementCount` uses Prisma's `upsert` (line 326) which is also non-atomic with respect to decrement. Over time, counters will drift from reality.

**Impact:** Hashtag post counts become inaccurate over time. Trending algorithm uses these counts, so trending results become unreliable.
**Fix:** Use a single `$executeRaw` with `GREATEST(count - 1, 0)` in one atomic SQL statement, matching the pattern used in `retractVote`. Or use the same approach as the poll: `$executeRaw` with `GREATEST`.

---

### [MEDIUM] A32-10 — Poll retractVote: Controller Does Not Pass `optionId` to Service

**File:** `apps/api/src/modules/polls/polls.controller.ts`, line 72; `polls.service.ts`, line 180

The `retractVote` controller method at line 72 calls `this.pollsService.retractVote(pollId, userId)` without passing an `optionId`. The service method signature at line 180 accepts `optionId?: string` as an optional third parameter.

For multi-choice polls (`allowMultiple: true`), this means the DELETE endpoint always retracts ALL votes the user made in the poll, not just one specific option. There is no way for a user to retract a vote on a single option in a multi-choice poll — they must retract all votes at once.

The controller's `@Delete(':id/vote')` endpoint does not accept a query parameter or body for `optionId`.

**Impact:** Broken UX for multi-choice polls. Users lose all votes when they intended to remove one.
**Fix:** Accept `optionId` as an optional query parameter in the DELETE endpoint. When provided, retract only that specific vote.

---

### [MEDIUM] A32-11 — OG Unfurl: `http://` Protocol Allowed — Cleartext Fetches from Server

**File:** `apps/api/src/modules/og/og.service.ts`, line 277

The unfurl endpoint allows both `http:` and `https:` protocols:
```typescript
if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
```

This means the Mizanly server will make cleartext HTTP requests to arbitrary external servers. An attacker can:
1. Supply an `http://` URL pointing to a server they control
2. Observe the Mizanly server's outbound IP address
3. If on a shared network (e.g., Railway's infrastructure), intercept the cleartext response

While SSRF protection blocks private IPs, allowing HTTP means responses can be intercepted by network-level attackers (MITM on the datacenter's network).

**Impact:** Information leakage of server's outbound IP. Potential MITM of unfurl responses on shared infrastructure.
**Fix:** Restrict to `https:` only. Remove `http:` acceptance.

---

### [LOW] A32-12 — Poll Endpoints: GET `:id` Uses `OptionalClerkAuthGuard` But No Visibility Check

**File:** `apps/api/src/modules/polls/polls.service.ts`, lines 22-77

The `getPoll` method fetches any poll by ID regardless of the parent thread's visibility. It includes the thread data but never checks `thread.visibility`. If a thread is set to `PRIVATE` or `FOLLOWERS_ONLY`, the poll attached to it is still publicly readable via `GET /polls/:id` by anyone who knows (or guesses) the poll ID.

The poll IDs are CUIDs which are not sequential but are predictable within a time window.

**Impact:** Information disclosure — private poll questions, options, and vote counts are accessible to unauthenticated users.
**Fix:** Check `thread.visibility` in `getPoll`. If not `PUBLIC`, require authentication and check if the user has access (is the author, or is a follower for `FOLLOWERS_ONLY`).

---

### [LOW] A32-13 — Hashtag Name: No Length or Pattern Validation on `incrementCount`/`decrementCount`

**File:** `apps/api/src/modules/hashtags/hashtags.service.ts`, lines 325-347

The `incrementCount` method at line 326 creates hashtags via `upsert` with whatever `name` is passed. There is no validation on the hashtag name. If the calling code passes a name with spaces, special characters, HTML tags, extremely long strings, or empty strings, it will be stored in the database.

The `name` field in the Prisma schema has no `@db.VarChar(N)` length constraint — it defaults to unlimited text. While the DTO for search has `@MaxLength(100)`, there is no validation at the service level where hashtags are created.

**Impact:** Malformed hashtags in the database. Potential XSS if hashtag names are rendered without escaping (unlikely in React Native but possible in OG/web views). Database bloat from arbitrarily long hashtag names.
**Fix:** Add validation in `incrementCount`: regex check for valid hashtag characters, max length 100, strip leading `#`.

---

### [LOW] A32-14 — Poll getVoters: Cursor Uses `userId` Not Composite Key — Breaks for Users Who Voted on Multiple Options

**File:** `apps/api/src/modules/polls/polls.service.ts`, lines 240-242

The cursor for voter pagination uses just the `userId`:
```typescript
const cursorObj = cursor
  ? { userId_optionId: { userId: cursor, optionId } }
  : undefined;
```

The cursor returned to the client is `items[items.length - 1].userId` (line 271). This works correctly because the query filters by a single `optionId`, so the composite cursor `(userId, optionId)` is fully determined. However, the API returns just `userId` as the cursor value, which means the client could confuse this with the user's ID for other purposes (a minor API design smell).

**Impact:** Minimal — functional but the cursor value leaks user IDs and has confusing semantics.
**Fix:** Consider using an opaque cursor (base64-encoded composite key) to avoid exposing raw user IDs.

---

### [LOW] A32-15 — OG Sitemap: No Pagination — Will Fail at Scale

**File:** `apps/api/src/modules/og/og.service.ts`, lines 132-185

The `getSitemapXml` method fetches up to 500 users, 500 posts, and 500 threads in parallel. At scale, this means:
1. Only 1,500 URLs maximum in the sitemap (Google recommends up to 50,000 per sitemap)
2. No sitemap index for when content exceeds limits
3. 3 large database queries on every request (cached for 24 hours via `Cache-Control` header but not in Redis)

More importantly, the sitemap is not cached in Redis. Every server restart or new pod deployment causes a fresh 3-query database hit.

**Impact:** Missing content from sitemap. Database load on server restarts.
**Fix:** Add Redis caching for sitemap XML. Implement sitemap index with pagination (sitemap-0.xml, sitemap-1.xml, etc.) when content exceeds 10K URLs.

---

### [LOW] A32-16 — Hashtag Follow/Unfollow: No Rate Limiting Beyond Class-Level Throttle

**File:** `apps/api/src/modules/hashtags/hashtags.controller.ts`, lines 84-104

The `POST :id/follow` and `DELETE :id/follow` endpoints share the class-level throttle of 60 requests per minute. This is generous for a follow/unfollow action. An attacker could rapidly follow/unfollow the same hashtag 60 times per minute, generating database writes (upsert + deleteMany) and potentially triggering webhook/event overhead.

The `followHashtag` service uses `upsert` (idempotent) and `unfollowHashtag` uses `deleteMany` (idempotent), so there's no data corruption risk. But the write amplification is unnecessary.

**Impact:** Unnecessary database write load. 60 upsert+deleteMany pairs per minute per IP.
**Fix:** Add a tighter `@Throttle` on follow/unfollow specifically (e.g., 10 per minute).

---

### [INFO] A32-17 — Poll VoteDto: Inline in Controller File Instead of Separate DTO File

**File:** `apps/api/src/modules/polls/polls.controller.ts`, lines 22-25

The `VoteDto` class is defined inline in the controller file rather than in a dedicated `dto/` directory. This is inconsistent with the hashtags module which has `dto/hashtag-query.dto.ts`. Minor code organization issue.

---

### [INFO] A32-18 — OG Service: `escapeHtml` Does Not Handle Backtick Character

**File:** `apps/api/src/modules/og/og.service.ts`, lines 11-18

The `escapeHtml` function escapes `&`, `<`, `>`, `"`, `'` but not the backtick (`` ` ``). While backticks are not significant in HTML attribute contexts (the OG tags use `"` for attributes), they can be meaningful in JavaScript template literal contexts. Since the `renderHtml` method includes inline JavaScript (line 403-414), a content value containing backticks could theoretically break the template literal context — though the current code does not interpolate user content into the `<script>` block.

**Impact:** Theoretical XSS vector if code is modified to interpolate user data into the script block.
**Fix:** Add backtick escaping to `escapeHtml`: `` .replace(/`/g, '&#96;') ``

---

## Checklist Verification

### 1. Poll vote manipulation — Can user vote multiple times? Vote after poll closes?

**PASS (partial).** Single-choice polls are protected by `findFirst` check + `P2002` unique constraint catch. Expired poll voting is blocked at line 98-100. Multi-choice polls allow multiple votes on different options with no upper bound (**A32-04**). The DB unique constraint `@@id([userId, optionId])` prevents duplicate votes on the same option.

### 2. Poll BOLA — Can non-owner close/edit poll?

**N/A.** No close or edit endpoints exist (**A32-06**). The only write operations are vote/retractVote which are per-user actions. `getVoters` correctly checks `thread.userId` ownership at line 235.

### 3. Hashtag injection — Special characters in hashtags? Script injection?

**PARTIAL FAIL.** Search DTO has `@MaxLength(100)` but no pattern validation. The `incrementCount` service method creates hashtags with no validation (**A32-13**). SQL LIKE wildcards (`%`, `_`) are not stripped from search input (**A32-08**). OG rendering uses `escapeHtml` which prevents XSS in OG meta tags. React Native rendering is naturally XSS-resistant.

### 4. OG unfurl SSRF — Does link preview fetch arbitrary URLs? Private network access?

**PASS (good).** The `assertNotPrivateUrl` + `safeFetch` utilities are well-implemented: DNS resolution → IP check against private CIDR ranges, redirect following with re-validation on each hop, IPv4-mapped IPv6 handling, fail-closed on invalid IPs. However, HTTP is allowed (**A32-11**), there's no response body size limit (**A32-01**), and the endpoint is unauthenticated (**A32-02**).

### 5. Rate limit — Vote, hashtag create, link unfurl without @Throttle?

**PARTIAL PASS.** Vote has explicit `@Throttle({ limit: 10, ttl: 60000 })`. Hashtag controller has class-level `@Throttle({ limit: 60, ttl: 60000 })`. OG unfurl has `@Throttle({ limit: 30, ttl: 60000 })`. All other OG endpoints have per-method throttles. Global `UserThrottlerGuard` provides baseline protection. However: retractVote has NO explicit `@Throttle` (relies on global only), and hashtag follow/unfollow share the generous 60/min class limit (**A32-16**).

### 6. Pagination — Hashtag post lists bounded?

**PASS.** All content listing methods (`getPostsByHashtag`, `getReelsByHashtag`, `getThreadsByHashtag`) use `take: limit + 1` with default limit of 20. The `getFollowedHashtags` also uses `take: limit + 1` with default 20. `getVoters` uses limit of 20. Trending uses a configurable limit capped at 100 in the controller. All paginated endpoints return proper `{ data, meta: { cursor, hasMore } }` format.

### 7. Cache — OG preview cached? Cache poisoning possible?

**PARTIAL PASS.** OG meta pages (post, reel, profile, thread) use HTTP `Cache-Control: public, max-age=3600` for CDN/browser caching. Unfurl results are cached in Redis for 1 hour. Trending hashtags are cached in Redis for 5 minutes with stampede protection. However, unfurl cache keys use raw URLs allowing cache bypass and poisoning (**A32-07**). Sitemap has HTTP cache but no Redis cache (**A32-15**).

### 8. Counter sync — Hashtag postsCount accurate? Poll vote counts?

**PARTIAL FAIL.** Poll vote counts use `$transaction` with atomic `increment` — this is correct and race-safe. The `P2002` catch prevents double-counting. Poll `retractVote` uses `$executeRaw` with `GREATEST(count - 1, 0)` — correct. However, hashtag counters use non-transactional decrement + separate floor operation (**A32-09**). The `incrementCount` upsert is atomic for individual operations but not coordinated with decrements. Over time at scale, hashtag counters will drift.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | A32-01, A32-02 |
| HIGH | 3 | A32-03, A32-04, A32-05 |
| MEDIUM | 6 | A32-06, A32-07, A32-08, A32-09, A32-10, A32-11 |
| LOW | 5 | A32-12, A32-13, A32-14, A32-15, A32-16 |
| INFO | 2 | A32-17, A32-18 |
| **Total** | **18** | |
