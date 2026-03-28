# Codex Audit 2026-03-26

## Blunt Infrastructure Assessment

The repo reads like a team sprinting to ship product breadth while repeatedly borrowing against infrastructure discipline. The shipping energy is obvious. The systems maturity is not.

In harsh terms: the project is trying to look like a platform before it behaves like one.

The gap is visible in several places:

- Feature surface is wide, but the basic engineering contract is not stable. The repo cannot currently claim clean build health because the mobile app fails typecheck and the workspace lint path is broken.
- Infrastructure is treated as optional in places where it is actually load-bearing. Redis failure does not stop the system; it quietly degrades into fake success, dropped jobs, disabled guarantees, and misleading runtime behavior.
- Reliability mechanisms are present but not trustworthy enough. Webhook deduplication is implemented in a way that can lose real events, which is exactly the kind of bug that only shows up when money or account state is already on the line.
- Security posture is uneven. There are good intentions and some real protections, but fallback behavior and blacklist-style validation show a codebase that is still thinking like a fast-moving application team, not an operator of a hostile public network.
- The API and mobile client are already drifting apart. That is a maturity warning. Once surface area gets this large, contract drift is how teams end up shipping broken flows without noticing until users do.
- Tooling is overstating quality. Placeholder lint scripts and partial verification are the kind of shortcuts that help a sprint feel fast while quietly eroding confidence in every release after it.
- The deeper pass makes the same point more brutally: this repo does not just tolerate immature fallbacks, it often institutionalizes them. Warnings, no-op paths, process-local retries, and "good enough for now" comments are standing in for real platform guarantees.

The core issue is not lack of effort. The issue is sequencing and discipline. The codebase has enough breadth now that infrastructure shortcuts are no longer harmless startup shortcuts. They are becoming product defects, operational hazards, and future scaling traps.

If the team keeps shipping features at the current rate without first hardening the platform layer, the likely outcome is predictable:

- more regressions hidden behind passing unit tests
- more “implemented” features that are operationally brittle
- more silent failure modes in queues, realtime, and background processing
- more app/backend mismatch
- a slower team in practice, because every new feature lands on an unstable base

Right now the project does not mainly have an innovation problem. It has a systems maturity problem. The repo already proves the team can build fast. What it has not yet proved is that it can operate a serious platform safely, consistently, and under failure.

An even harsher but defensible version:

- The team is shipping platform-shaped code faster than it is building platform-grade truthfulness.
- Too many subsystems report "up", "done", or "handled" when the real answer is "not configured", "not durable", or "not actually implemented".
- That is how a product becomes impressive in demos and treacherous in production.

## Scope

Repository-wide audit of workspace tooling, backend runtime/security behavior, mobile runtime/build health, and client/server contract integrity.

Verification performed from the repo:

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd test --workspace=apps\api -- --runInBand`

Observed results:

- Root `lint` failed because the workspace graph is misconfigured.
- Mobile `typecheck` failed on a real syntax/duplicate declaration error.
- API tests passed (`302` suites / `5238` tests), but Jest reported open handles after completion.

## Findings

### 1. High: mobile app is not currently buildable

`apps/mobile` fails TypeScript compilation because `currentIndexRef` is declared twice in the same scope.

Evidence:

- `apps/mobile/app/(tabs)/bakra.tsx:530`
- `apps/mobile/app/(tabs)/bakra.tsx:531`

Impact:

- Blocks clean CI/typecheck.
- Makes the mobile app non-releasable until fixed.

### 2. High: Redis fallback silently disables controls and drops work

When Redis is missing or not ready, the backend does not fail fast. Instead it switches to behavior that removes operational guarantees:

- queue jobs are silently dropped
- WebSocket/presence rate limits effectively stop working
- Redis-backed idempotency and presence tracking degrade

Evidence:

- `apps/api/src/common/queue/queue.module.ts:43`
- `apps/api/src/common/queue/queue.module.ts:47`
- `apps/api/src/config/redis.module.ts:10`
- `apps/api/src/config/redis.module.ts:24`
- `apps/api/src/config/redis.module.ts:37`
- `apps/api/src/config/redis.module.ts:43`
- `apps/api/src/config/redis.module.ts:47`

Why this matters:

- Returning `"OK"` or `0` from a proxy is not equivalent to degraded infrastructure.
- Security and correctness logic can now "succeed" while doing nothing.
- Background jobs such as notifications, media processing, analytics, webhooks, search indexing, and AI tasks can be lost without surfacing as failures.

### 3. High: webhook idempotency is marked before processing succeeds

Both Stripe and Clerk webhook handlers write the dedupe key before downstream processing completes.

Evidence:

- `apps/api/src/modules/payments/stripe-webhook.controller.ts:69`
- `apps/api/src/modules/payments/stripe-webhook.controller.ts:77`
- `apps/api/src/modules/auth/webhooks.controller.ts:101`
- `apps/api/src/modules/auth/webhooks.controller.ts:110`

Impact:

- If handler logic fails after `setex`, retries can be incorrectly skipped.
- This can permanently lose payment/account state transitions.

Recommended fix:

- Mark the webhook as processed only after successful handling, or persist processing state with a `processing`/`completed` transition.

### 4. High: webhook URL validation is blacklist-based and SSRF-prone

Webhook destination validation only checks `https:` and a short hostname substring blacklist.

Evidence:

- `apps/api/src/modules/webhooks/webhooks.service.ts:16`
- `apps/api/src/modules/webhooks/webhooks.service.ts:22`
- `apps/api/src/modules/webhooks/webhooks.service.ts:23`

Why this is weak:

- It does not resolve DNS.
- It does not robustly reject private/internal targets across alternate IP encodings or internal hostnames outside the hardcoded substrings.
- It is not a sufficient SSRF defense for user-controlled outbound requests.

Recommended fix:

- Resolve and validate destination IPs against private/link-local/loopback/reserved ranges.
- Consider an allowlist or egress proxy for webhook delivery.

### 5. High: repo linting is not trustworthy

The root lint command is broken, and package lint scripts are placeholders that do not actually lint or typecheck.

Evidence:

- Root workspace lint script: `package.json:13`
- Missing shared lint script: `packages/shared/package.json:7`
- API lint is an `echo`: `apps/api/package.json:15`
- Mobile lint is an `echo`: `apps/mobile/package.json:11`

Impact:

- Engineers and CI can get a false sense of safety.
- Real regressions are left to `typecheck` or tests, and even those are incomplete at workspace level.

### 6. Medium: WebSocket CORS becomes effectively allow-all when `CORS_ORIGINS` is unset

The chat gateway accepts all origins when no explicit allowed origins are configured.

Evidence:

- `apps/api/src/gateways/chat.gateway.ts:44`
- `apps/api/src/gateways/chat.gateway.ts:45`
- `apps/api/src/gateways/chat.gateway.ts:46`

Impact:

- Misconfiguration degrades to permissive behavior instead of secure default behavior.
- This is especially risky for authenticated real-time endpoints.

### 7. Medium: sanitization exists but is applied inconsistently across user-generated content

The project has `sanitizeText` and even a `SanitizePipe`, but the pipe is not wired globally, and several content paths persist raw text.

Evidence that the pipe exists but is not globally used:

- `apps/api/src/common/pipes/sanitize.pipe.ts:5`
- `apps/api/src/main.ts:100`

Evidence of unsanitized persistence:

- Community notes: `apps/api/src/modules/community-notes/community-notes.service.ts:26`
- Messages send path: `apps/api/src/modules/messages/messages.service.ts:257`
- Messages edit path: `apps/api/src/modules/messages/messages.service.ts:327`
- Commerce product create/update: `apps/api/src/modules/commerce/commerce.service.ts:47`, `apps/api/src/modules/commerce/commerce.service.ts:97`
- Commerce review comments: `apps/api/src/modules/commerce/commerce.service.ts:130`

Impact:

- Inconsistent content hygiene across the platform.
- Increased risk if any downstream renderer treats stored text as rich content.
- Moderation/sanitization rules behave differently by module.

### 8. Medium: mobile startup depends on a non-validated Clerk env var

The mobile app asserts the Clerk publishable key with a non-null assertion and passes it directly into `ClerkProvider`.

Evidence:

- `apps/mobile/app/_layout.tsx:88`
- `apps/mobile/app/_layout.tsx:545`

Impact:

- Missing or misnamed env configuration fails late at runtime rather than through an explicit app-controlled startup check.

### 9. Medium: client/server contract drift is real, and one wrapper is broken

There are verified mismatches between mobile API wrappers and backend controllers.

Broken wrapper:

- Mobile sends `{ targetConversationIds }`: `apps/mobile/src/services/api.ts:780`
- Backend expects `conversationIds`: `apps/api/src/modules/messages/messages.controller.ts:40`
- Backend forwards using `dto.conversationIds`: `apps/api/src/modules/messages/messages.controller.ts:427`

Confirmed nonexistent endpoint wrapper:

- Mobile exposes `removeBranded`: `apps/mobile/src/services/promotionsApi.ts:20`
- Backend controller only defines `POST /promotions/branded`, not a delete route: `apps/api/src/modules/promotions/promotions.controller.ts:96`

Confirmed stale comment / drift:

- Mobile says `share-as-story` does not exist: `apps/mobile/src/services/api.ts:479`
- Backend route does exist: `apps/api/src/modules/posts/posts.controller.ts:370`

Impact:

- Some user flows will fail with `400`/`404`.
- The generated API layer is no longer a reliable source of truth for the app team.

### 10. Medium: test suite health is better than build health, but still not clean

The API test suite passed, but Jest reported open handles after completion.

Observed during:

- `npm.cmd test --workspace=apps\api -- --runInBand`

Impact:

- Hidden resource leaks or long-lived timers can make CI flaky.
- "All tests passed" overstates actual runtime cleanliness.

### 11. High: critical infrastructure prerequisites are not enforced at startup

The backend repeatedly chooses "warn and continue" where a serious platform should choose "fail fast." Missing infrastructure does not stop the app from booting into a degraded, misleading state.

Evidence:

- Queue no-op mode with fake job ids and dropped work: `apps/api/src/common/queue/queue.module.ts:44`, `apps/api/src/common/queue/queue.module.ts:47`, `apps/api/src/common/queue/queue.module.ts:49`
- Redis no-op proxy returns fake reads/writes/numbers and even fake `PONG`: `apps/api/src/config/redis.module.ts:10`, `apps/api/src/config/redis.module.ts:24`, `apps/api/src/config/redis.module.ts:37`, `apps/api/src/config/redis.module.ts:43`, `apps/api/src/config/redis.module.ts:47`, `apps/api/src/config/redis.module.ts:60`
- Database connect failure falls through to "try later on first query": `apps/api/src/config/prisma.service.ts:17`, `apps/api/src/config/prisma.service.ts:24`
- Missing upload/stream config only logs warnings: `apps/api/src/modules/upload/upload.service.ts:54`, `apps/api/src/modules/stream/stream.service.ts:47`

Why this is a systems maturity gap:

- Startup success no longer means the platform is actually capable of processing work.
- Operators can get a "running" service that is incapable of enforcing rate limits, processing queues, or serving core media flows.
- This is not graceful degradation. It is operational dishonesty.

### 12. High: multiple workers simply disable themselves when Redis is absent

The queue layer is not merely degraded without Redis. Large parts of the background system do not exist.

Evidence:

- Notification worker disabled: `apps/api/src/common/queue/processors/notification.processor.ts:30`
- Media worker disabled: `apps/api/src/common/queue/processors/media.processor.ts:49`
- Analytics worker disabled: `apps/api/src/common/queue/processors/analytics.processor.ts:40`
- Webhook worker disabled: `apps/api/src/common/queue/processors/webhook.processor.ts:37`
- Search indexing worker disabled: `apps/api/src/common/queue/processors/search-indexing.processor.ts:34`
- AI tasks worker disabled: `apps/api/src/common/queue/processors/ai-tasks.processor.ts:41`

Impact:

- Notifications, media processing, analytics, outbound webhooks, search indexing, and AI jobs can all disappear as capabilities while the API still boots.
- The platform can look alive from the outside while major subsystems are effectively turned off.

### 13. High: some background work is marked complete even when it is not implemented

There is at least one worker path that reaches 100% progress with a TODO instead of a production pipeline.

Evidence:

- Caption generation is still a TODO: `apps/api/src/common/queue/processors/ai-tasks.processor.ts:137`, `apps/api/src/common/queue/processors/ai-tasks.processor.ts:140`
- The same job is still marked complete: `apps/api/src/common/queue/processors/ai-tasks.processor.ts:151`

Impact:

- Monitoring and job history can report successful completion for work that never happened.
- This is exactly how teams end up trusting dashboards that are lying to them.

### 14. High: media privacy controls are incomplete because original uploads can retain EXIF/GPS data

The image processor strips metadata from processed variants, but the code explicitly documents that the original upload stored in R2 still contains full EXIF metadata and that the original URL is stored in the database.

Evidence:

- `apps/api/src/common/queue/processors/media.processor.ts:17`
- `apps/api/src/common/queue/processors/media.processor.ts:23`
- `apps/api/src/common/queue/processors/media.processor.ts:25`
- `apps/api/src/common/queue/processors/media.processor.ts:33`

Impact:

- Users can upload photos whose original files still expose GPS coordinates, timestamps, and device metadata.
- For a social platform, that is not a cosmetic issue. It is a real privacy failure.

### 15. Medium: realtime shutdown and resource cleanup look incomplete

The chat gateway duplicates a Redis subscriber and subscribes during module init, but the file does not implement a corresponding gateway shutdown path for that subscriber. The same gateway also owns heartbeat timers. This is a plausible source of the open handles reported by Jest.

Evidence:

- Redis duplicate/subscription: `apps/api/src/gateways/chat.gateway.ts:85`, `apps/api/src/gateways/chat.gateway.ts:86`
- Heartbeat timers are created and tracked: `apps/api/src/gateways/chat.gateway.ts:63`, `apps/api/src/gateways/chat.gateway.ts:217`, `apps/api/src/gateways/chat.gateway.ts:224`
- No `OnModuleDestroy` implementation appears in the gateway file.

Impact:

- Tests and local runtime can leak resources.
- Long-lived subscribers and timers are the sort of issue that stays "minor" until it starts making CI flaky and restarts dirty.

### 16. Medium: search indexing is soft-fail to the point that success becomes untrustworthy

Meilisearch is treated as optional, and several indexing methods swallow failures or ignore non-OK responses. The indexing worker can therefore believe work succeeded when no durable index update actually happened.

Evidence:

- Service advertises graceful fallback: `apps/api/src/modules/search/meilisearch.service.ts:28`
- Search returns `null` when unavailable or failed: `apps/api/src/modules/search/meilisearch.service.ts:108`, `apps/api/src/modules/search/meilisearch.service.ts:127`, `apps/api/src/modules/search/meilisearch.service.ts:133`
- `addDocuments` does not validate response success: `apps/api/src/modules/search/meilisearch.service.ts:138`, `apps/api/src/modules/search/meilisearch.service.ts:142`
- `deleteDocument`, `createIndex`, and `updateSettings` only log failures: `apps/api/src/modules/search/meilisearch.service.ts:155`, `apps/api/src/modules/search/meilisearch.service.ts:168`, `apps/api/src/modules/search/meilisearch.service.ts:183`

Impact:

- Search freshness can drift without hard failures.
- Queue/job success is not a reliable indicator that search state is current.

### 17. Medium: notification delivery is missing stronger operational controls

Push delivery is functional, but the service still looks like a first implementation rather than a hardened notification subsystem.

Evidence:

- Expo access token is read at module load time from `process.env`, not runtime config: `apps/api/src/modules/notifications/push.service.ts:8`, `apps/api/src/modules/notifications/push.service.ts:9`
- Locale support is defined but not actually backed by user data yet: `apps/api/src/modules/notifications/push.service.ts:11`, `apps/api/src/modules/notifications/push.service.ts:12`
- Batch failures are logged and processing continues: `apps/api/src/modules/notifications/push.service.ts:138`, `apps/api/src/modules/notifications/push.service.ts:148`

Impact:

- Misconfiguration can hide until delivery time.
- Failed batches do not clearly feed into retry, dead-letter, or operator-facing failure accounting.

### 18. Medium: AI and quota controls degrade permissively under dependency failure

The AI layer frequently chooses fallback behavior over explicit unavailability. The quota path is the clearest example: when Redis is down, the service allows requests instead of enforcing the limit.

Evidence:

- Daily quota comment and logic: `apps/api/src/modules/ai/ai.service.ts:53`, `apps/api/src/modules/ai/ai.service.ts:71`, `apps/api/src/modules/ai/ai.service.ts:72`

Impact:

- Abuse controls become optional under infrastructure failure.
- This is convenient for demos and dangerous for a public platform.

### 19. Medium: health signals and runtime behavior do not agree

The health controller treats database and Redis as critical for readiness, but large parts of the application still boot and fabricate successful behavior when those same dependencies are unavailable.

Evidence:

- Readiness requires DB and Redis: `apps/api/src/modules/health/health.controller.ts:79`, `apps/api/src/modules/health/health.controller.ts:84`
- Admin health also reports queue stats: `apps/api/src/modules/health/health.controller.ts:123`
- Queue and Redis layers can still return fake-success values: `apps/api/src/common/queue/queue.module.ts:49`, `apps/api/src/config/redis.module.ts:30`, `apps/api/src/config/redis.module.ts:31`

Impact:

- The repo mixes strict readiness semantics with permissive runtime semantics.
- That makes health checks, dashboards, and operator intuition less trustworthy than they should be.

### 20. Medium: some internal job/retry infrastructure is still process-local rather than platform-grade

The async jobs helper retries with in-process `setTimeout` recursion. That is fine as a stopgap, but it is not durable retry infrastructure for a system that wants platform-level guarantees.

Evidence:

- Retry options and recursive execution: `apps/api/src/common/services/async-jobs.service.ts:26`, `apps/api/src/common/services/async-jobs.service.ts:31`, `apps/api/src/common/services/async-jobs.service.ts:50`
- Retry delay uses `setTimeout` inside the process: `apps/api/src/common/services/async-jobs.service.ts:53`, `apps/api/src/common/services/async-jobs.service.ts:54`

Impact:

- Retries disappear on process crash or restart.
- Operational behavior depends on one Node process staying alive, which is not a serious platform contract.

### 21. High: the repo explicitly classifies load-bearing infrastructure as "recommended"

Environment validation only hard-requires the database and Clerk secret. Redis, storage, streaming, search, payments, Sentry, AI, and CORS are all treated as optional and logged as fallback-capable.

Evidence:

- Required envs are only `DATABASE_URL` and `CLERK_SECRET_KEY`: `apps/api/src/main.ts:15`, `apps/api/src/main.ts:18`
- Redis, Stripe, R2, Stream, Meilisearch, and CORS are merely "recommended": `apps/api/src/main.ts:19`, `apps/api/src/main.ts:20`, `apps/api/src/main.ts:22`, `apps/api/src/main.ts:25`, `apps/api/src/main.ts:29`, `apps/api/src/main.ts:31`, `apps/api/src/main.ts:34`
- Missing recommended envs only warn that the app "will use fallback": `apps/api/src/main.ts:49`, `apps/api/src/main.ts:51`

Why this is harshly important:

- The codebase is telling operators that systems it plainly depends on are optional.
- That is not resilience. It is a low standard for truth.

### 22. High: tests are enshrining fake-success infrastructure behavior instead of rejecting it

The Redis proxy fallback is not just an implementation detail. It is covered by tests that assert disconnected Redis should return `OK`, `0`, `PONG`, and chainable pipeline stubs.

Evidence:

- Test file title and purpose: `apps/api/src/config/redis.module.spec.ts:2`, `apps/api/src/config/redis.module.spec.ts:4`
- Write commands expected to return `OK`: `apps/api/src/config/redis.module.spec.ts:11`, `apps/api/src/config/redis.module.spec.ts:13`
- Numeric commands expected to return `0`: `apps/api/src/config/redis.module.spec.ts:16`, `apps/api/src/config/redis.module.spec.ts:18`
- Ping expected to return `PONG`: `apps/api/src/config/redis.module.spec.ts:21`, `apps/api/src/config/redis.module.spec.ts:23`
- Pipeline stub expected to execute successfully: `apps/api/src/config/redis.module.spec.ts:26`, `apps/api/src/config/redis.module.spec.ts:34`

Impact:

- The test suite is not merely missing a maturity bar here. It is defending the absence of one.
- This is a cultural warning sign: the codebase is teaching itself that lying about infrastructure state is acceptable behavior.

### 23. High: horizontal scalability is still treated as a best-effort convenience, not a platform property

The Socket.io adapter falls back to in-memory mode if Redis is absent or connection setup fails. That means multi-instance realtime behavior is optional.

Evidence:

- Redis adapter docs comment: `apps/api/src/config/socket-io-adapter.ts:7`, `apps/api/src/config/socket-io-adapter.ts:11`
- Missing Redis falls back to single-instance mode: `apps/api/src/config/socket-io-adapter.ts:18`, `apps/api/src/config/socket-io-adapter.ts:20`
- Connection failure also falls back to in-memory mode: `apps/api/src/config/socket-io-adapter.ts:24`, `apps/api/src/config/socket-io-adapter.ts:33`, `apps/api/src/config/socket-io-adapter.ts:34`

Impact:

- Realtime correctness across instances is not guaranteed.
- A platform that wants to act like a network cannot treat cross-instance messaging as an optional enhancement.

### 24. Medium: email and other operator-facing channels still degrade into logging instead of delivery guarantees

The email service silently becomes a logger when Resend is unavailable or unconfigured.

Evidence:

- Missing Resend key logs only: `apps/api/src/common/services/email.service.ts:28`, `apps/api/src/common/services/email.service.ts:30`
- Initialization failure also logs only: `apps/api/src/common/services/email.service.ts:34`, `apps/api/src/common/services/email.service.ts:39`
- Fallback path records that the email was not sent: `apps/api/src/common/services/email.service.ts:75`, `apps/api/src/common/services/email.service.ts:76`

Impact:

- Security alerts and account emails can quietly degrade from delivery to log lines.
- That is survivable in development and unacceptable as an operational default for a serious platform.

### 25. High: some privacy-sensitive flows are still admitted in code comments as legally incomplete

The code documents unresolved privacy and compliance gaps in areas that are not optional for a public social platform.

Evidence:

- Contact sync still transmits third-party phone numbers server-side and explicitly lists missing hashing/consent work: `apps/api/src/modules/users/dto/contact-sync.dto.ts:7`, `apps/api/src/modules/users/dto/contact-sync.dto.ts:12`, `apps/api/src/modules/users/dto/contact-sync.dto.ts:15`
- Reports flow contains TODO-only handling for CSAM, terrorism, and Australian online safety obligations: `apps/api/src/modules/reports/reports.service.ts:132`, `apps/api/src/modules/reports/reports.service.ts:139`, `apps/api/src/modules/reports/reports.service.ts:144`

Why this matters:

- These are not nice-to-have polish items. They are part of the minimum adult operating model for a social platform.
- Leaving them as comments is an honest admission that trust-and-safety operations are not yet production-grade.

### 26. Medium: CORS and origin policy still degrade toward convenience defaults

The API defaults CORS to localhost origins when `CORS_ORIGINS` is unset, while the realtime gateway separately computes its own origin handling. This is another sign of fragmented, convenience-first perimeter control.

Evidence:

- Main API CORS falls back to localhost defaults: `apps/api/src/main.ts:73`, `apps/api/src/main.ts:75`
- Chat gateway has its own origin logic based on `process.env.CORS_ORIGINS`: `apps/api/src/gateways/chat.gateway.ts:44`

Impact:

- Security-sensitive boundary behavior is split across layers and dependent on environment hygiene.
- That is manageable in a prototype and sloppy in a platform backend.

### 27. High: personalized feed pagination is not trustworthy because the main ranking path ignores the cursor

The personalized feed endpoint accepts a `cursor`, returns a `cursor`, and only uses that cursor in cold-start/trending branches. Once the request goes through the real personalized ranking path, the cursor is effectively ignored.

Evidence:

- Personalized feed method accepts `cursor`: `apps/api/src/modules/feed/personalized-feed.service.ts:251`, `apps/api/src/modules/feed/personalized-feed.service.ts:254`
- Personalized branch goes straight into ranking with no cursor-based filtering: `apps/api/src/modules/feed/personalized-feed.service.ts:264`, `apps/api/src/modules/feed/personalized-feed.service.ts:293`, `apps/api/src/modules/feed/personalized-feed.service.ts:310`
- A new cursor is still emitted from the last hydrated item: `apps/api/src/modules/feed/personalized-feed.service.ts:417`, `apps/api/src/modules/feed/personalized-feed.service.ts:418`, `apps/api/src/modules/feed/personalized-feed.service.ts:423`

Impact:

- Pagination correctness is a mirage for warm users.
- Users can see duplicates, unstable page boundaries, or inconsistent continuation under load.
- A serious social feed cannot fake cursor semantics and still call itself mature.

### 28. High: multiple social-graph filters hard-cap at 50, so correctness degrades for heavy users

Block lists, mutes, restricts, and followed hashtags are repeatedly capped at 50 in hot paths. That is a prototype assumption dressed up as production logic.

Evidence:

- Personalized feed excluded users cap blocks/mutes/restricts at 50: `apps/api/src/modules/feed/personalized-feed.service.ts:69`, `apps/api/src/modules/feed/personalized-feed.service.ts:73`, `apps/api/src/modules/feed/personalized-feed.service.ts:78`, `apps/api/src/modules/feed/personalized-feed.service.ts:83`
- Personalized feed followed hashtags capped at 50: `apps/api/src/modules/feed/personalized-feed.service.ts:282`, `apps/api/src/modules/feed/personalized-feed.service.ts:287`
- Feed transparency exclusions cap blocks/mutes at 50: `apps/api/src/modules/feed/feed-transparency.service.ts:177`, `apps/api/src/modules/feed/feed-transparency.service.ts:181`, `apps/api/src/modules/feed/feed-transparency.service.ts:186`
- Search discovery exclusions cap blocks/mutes at 50: `apps/api/src/modules/search/search.service.ts:177`, `apps/api/src/modules/search/search.service.ts:181`, `apps/api/src/modules/search/search.service.ts:186`

Impact:

- Past the first 50 relationships, exclusion and personalization logic becomes wrong.
- The users most likely to stress the graph are exactly the users for whom the platform starts lying.

### 29. High: trending is still built by fetching a small candidate pool and sorting in application memory

The trending feed does not rank the full eligible corpus. It fetches a bounded slice from the database, computes scores in Node, sorts in memory, then paginates from there.

Evidence:

- Main trending feed fetches 200 recent posts and scores them in memory: `apps/api/src/modules/feed/feed.service.ts:339`, `apps/api/src/modules/feed/feed.service.ts:352`, `apps/api/src/modules/feed/feed.service.ts:358`, `apps/api/src/modules/feed/feed.service.ts:369`
- Personalized-feed trending variants do the same pattern with `(limit + 1) * 2` candidate pools and in-memory decay sorting: `apps/api/src/modules/feed/personalized-feed.service.ts:536`, `apps/api/src/modules/feed/personalized-feed.service.ts:547`, `apps/api/src/modules/feed/personalized-feed.service.ts:549`, `apps/api/src/modules/feed/personalized-feed.service.ts:555`

Impact:

- "Trending" is only as real as the candidate slice.
- As content volume rises, strong items outside the sampled window become invisible.
- This is acceptable for an MVP and weak for a platform that wants to claim ranking quality under scale.

### 30. High: recommendation and feed ranking still depend on fixed-size candidate windows and in-memory reranking

The pgvector/ranking stack sounds sophisticated, but the implementation still assumes candidate counts that fit comfortably in application memory and follow-up Prisma fetches.

Evidence:

- Personalized feed asks pgvector for top 500 and reranks in memory: `apps/api/src/modules/feed/personalized-feed.service.ts:293`, `apps/api/src/modules/feed/personalized-feed.service.ts:296`, `apps/api/src/modules/feed/personalized-feed.service.ts:302`, `apps/api/src/modules/feed/personalized-feed.service.ts:369`
- Recommendation ranking also uses top 500, then pulls author/hashtag maps and performs multiple in-memory passes: `apps/api/src/modules/recommendations/recommendations.service.ts:194`, `apps/api/src/modules/recommendations/recommendations.service.ts:219`, `apps/api/src/modules/recommendations/recommendations.service.ts:231`, `apps/api/src/modules/recommendations/recommendations.service.ts:251`, `apps/api/src/modules/recommendations/recommendations.service.ts:276`
- Helper queries are explicitly capped at 500 rows for engagement/author/hashtag maps: `apps/api/src/modules/recommendations/recommendations.service.ts:325`, `apps/api/src/modules/recommendations/recommendations.service.ts:336`, `apps/api/src/modules/recommendations/recommendations.service.ts:347`, `apps/api/src/modules/recommendations/recommendations.service.ts:364`, `apps/api/src/modules/recommendations/recommendations.service.ts:382`

Impact:

- Ranking quality and latency are both bounded by arbitrary candidate ceilings.
- This is not yet a robust large-scale ranking pipeline; it is a strong prototype with hard-coded limits.

### 31. High: reel and thread recommendation "seen" filtering is built on a post-only interaction table

The recommendation pipeline uses `FeedInteraction` as its seen-history source, but that table stores `postId`, not a generic content identifier. The same ranking path is then used for posts, reels, and threads.

Evidence:

- `FeedInteraction` stores `postId` and is unique on `[userId, postId]`: `apps/api/prisma/schema.prisma:2083`, `apps/api/prisma/schema.prisma:2086`, `apps/api/prisma/schema.prisma:2099`
- Recommendation ranking reads seen ids from `feedInteraction.postId`: `apps/api/src/modules/recommendations/recommendations.service.ts:211`, `apps/api/src/modules/recommendations/recommendations.service.ts:213`, `apps/api/src/modules/recommendations/recommendations.service.ts:217`
- The same `multiStageRank` method is then used for reels and threads: `apps/api/src/modules/recommendations/recommendations.service.ts:655`, `apps/api/src/modules/recommendations/recommendations.service.ts:740`

Impact:

- Inference: "already seen" filtering is structurally credible for posts and structurally suspect for other content types.
- That creates duplicate-serving risk exactly where short-video and thread ranking need to feel sharpest.

### 32. High: search fallback admits it is doing parallel table scans, which is not acceptable as a serious default

The code comments are unusually explicit here: without Meilisearch, one search request runs multiple `ILIKE '%query%'` scans across major content tables.

Evidence:

- Search service comment explicitly says fallback search is "7 parallel table scans": `apps/api/src/modules/search/search.service.ts:301`, `apps/api/src/modules/search/search.service.ts:302`, `apps/api/src/modules/search/search.service.ts:303`
- Fallback aggregate search then runs repeated `contains` queries across users, threads, posts, reels, videos, channels, and hashtags: `apps/api/src/modules/search/search.service.ts:308`, `apps/api/src/modules/search/search.service.ts:326`, `apps/api/src/modules/search/search.service.ts:339`, `apps/api/src/modules/search/search.service.ts:351`, `apps/api/src/modules/search/search.service.ts:364`, `apps/api/src/modules/search/search.service.ts:378`, `apps/api/src/modules/search/search.service.ts:395`

Impact:

- Search performance without Meilisearch is not just degraded. It is architecturally unfit for scale.
- If Meilisearch is optional in env validation, then this scan-heavy path is one misconfiguration away from being production reality.

### 33. Medium: several hot ranking paths sort by engagement fields that the schema does not obviously index

The schema heavily indexes recency and ownership, but the hot feed/recommendation code sorts posts by `likesCount` and related engagement fields. I did not find corresponding Post-level engagement indexes in the schema.

Evidence:

- Post indexes are on recency, circle, space, hashtags, and featured state: `apps/api/prisma/schema.prisma:1052`, `apps/api/prisma/schema.prisma:1053`, `apps/api/prisma/schema.prisma:1054`, `apps/api/prisma/schema.prisma:1055`, `apps/api/prisma/schema.prisma:1056`, `apps/api/prisma/schema.prisma:1057`
- Hot paths sort posts by engagement-heavy orderings: `apps/api/src/modules/feed/personalized-feed.service.ts:546`, `apps/api/src/modules/recommendations/recommendations.service.ts:631`, `apps/api/src/modules/search/search.service.ts:348`

Impact:

- Inference: the DB is likely leaning on broader scans/sorts for some of the very endpoints that need to feel instantaneous.
- That is survivable early and expensive later.

### 34. Medium: dismissal and session-history limits show more small-data assumptions in feed logic

The feed stack keeps finite slices of negative signals and dismissal history rather than a durable, correctness-first model.

Evidence:

- Negative signals list is trimmed to 200 entries in Redis: `apps/api/src/modules/feed/feed.service.ts:93`, `apps/api/src/modules/feed/feed.service.ts:96`
- Dismissed content lookup only reads 1000 records: `apps/api/src/modules/feed/feed.service.ts:105`, `apps/api/src/modules/feed/feed.service.ts:106`
- Personalized session viewed ids are capped at 1000: `apps/api/src/modules/feed/personalized-feed.service.ts:35`, `apps/api/src/modules/feed/personalized-feed.service.ts:405`

Impact:

- Feed memory gets lossy as usage increases.
- That makes personalization and de-duplication progressively less accurate for your most engaged users.

### 35. High: denormalized counters and social state are maintained with too much best-effort logic

The platform relies heavily on precomputed counters and summary fields, but many of the follow-up updates, notifications, cache invalidations, and cleanups are explicitly non-blocking or best-effort.

Evidence:

- Thread like/repost updates are transactional, but notifications are fire-and-forget after commit: `apps/api/src/modules/threads/threads.service.ts:573`, `apps/api/src/modules/threads/threads.service.ts:584`, `apps/api/src/modules/threads/threads.service.ts:626`, `apps/api/src/modules/threads/threads.service.ts:650`
- Message send updates unread counts and conversation summary in one transaction, but transcription and later delivery paths are asynchronous follow-up work: `apps/api/src/modules/messages/messages.service.ts:259`, `apps/api/src/modules/messages/messages.service.ts:277`, `apps/api/src/modules/messages/messages.service.ts:286`, `apps/api/src/modules/messages/messages.service.ts:294`
- Blocking a user triggers additional cache invalidation and social cleanup outside the main transaction: `apps/api/src/modules/blocks/blocks.service.ts:99`, `apps/api/src/modules/blocks/blocks.service.ts:112`, `apps/api/src/modules/blocks/blocks.service.ts:124`

Impact:

- The user-facing state can say one thing while secondary systems still say another.
- That is how a social platform accumulates "my count is wrong", "this chat still exists", and "I still got notified by someone I blocked" bugs that are hard to reproduce and easy to dismiss until users lose trust.

### 36. High: some fan-out and cleanup work is still done with sequential per-item processing

There are hot social operations that still iterate item-by-item instead of using durable batched fan-out patterns.

Evidence:

- Message forwarding loops conversations one at a time, performs membership/block checks per target, creates messages per target, and updates each conversation individually: `apps/api/src/modules/messages/messages.service.ts:761`, `apps/api/src/modules/messages/messages.service.ts:766`, `apps/api/src/modules/messages/messages.service.ts:785`, `apps/api/src/modules/messages/messages.service.ts:796`
- Block cleanup decrements circle counts in a loop with one raw update per circle: `apps/api/src/modules/blocks/blocks.service.ts:136`, `apps/api/src/modules/blocks/blocks.service.ts:138`, `apps/api/src/modules/blocks/blocks.service.ts:139`
- Notification batching still uses per-notification DB lookup/update logic before push and socket side effects: `apps/api/src/modules/notifications/notifications.service.ts:231`, `apps/api/src/modules/notifications/notifications.service.ts:237`, `apps/api/src/modules/notifications/notifications.service.ts:253`

Impact:

- Burst behavior gets more expensive than it should be.
- The app will look fine at modest traffic and then suddenly feel fragile around shared posts, multi-forward actions, or dense social graphs.

### 37. High: observability is still process-local and too weak for real incident diagnosis

The repo has logging, a correlation id, and a basic metrics endpoint, but the operational picture is still too shallow. The request logger keeps counters in memory on one process, and the health metrics endpoint returns snapshots instead of a real metrics stream.

Evidence:

- Request logger stores request/error/slow counters in memory inside one middleware instance: `apps/api/src/common/middleware/request-logger.middleware.ts:10`, `apps/api/src/common/middleware/request-logger.middleware.ts:11`, `apps/api/src/common/middleware/request-logger.middleware.ts:12`, `apps/api/src/common/middleware/request-logger.middleware.ts:49`
- Health metrics endpoint returns process memory, in-process job stats, and queue stats on request, not durable cross-instance telemetry: `apps/api/src/modules/health/health.controller.ts:101`, `apps/api/src/modules/health/health.controller.ts:122`, `apps/api/src/modules/health/health.controller.ts:123`, `apps/api/src/modules/health/health.controller.ts:125`
- Sentry tracing is present but sampled at 10%, with no evidence here of richer service-level latency/error instrumentation: `apps/api/src/config/sentry.ts:5`, `apps/api/src/config/sentry.ts:8`

Impact:

- On a horizontally scaled system, operators do not get a truthful global picture from these counters.
- When performance degrades, the repo appears more capable of logging that something was slow than of explaining why.

### 38. Medium: analytics and metrics buffering is still another soft-loss path

Analytics events and counters are buffered in-process and flushed periodically to Redis. If the process dies, the flush fails, or Redis is in proxy mode, the system can report healthy behavior while losing measurement fidelity.

Evidence:

- Analytics events sit in an in-memory buffer and flush every 10 seconds: `apps/api/src/common/services/analytics.service.ts:27`, `apps/api/src/common/services/analytics.service.ts:31`, `apps/api/src/common/services/analytics.service.ts:32`
- Flush failure requeues back into process memory: `apps/api/src/common/services/analytics.service.ts:92`, `apps/api/src/common/services/analytics.service.ts:101`, `apps/api/src/common/services/analytics.service.ts:103`
- Redis counters and pipeline writes are central to this service: `apps/api/src/common/services/analytics.service.ts:56`, `apps/api/src/common/services/analytics.service.ts:58`, `apps/api/src/common/services/analytics.service.ts:94`

Impact:

- Product analytics and operational counters are weaker exactly when the system is under stress or instability.
- That removes the evidence you need during incidents.

### 39. Medium: request logging is not the same as performance instrumentation

The repo comments describe the request logger as a lightweight alternative to APM, but what it actually records is a coarse threshold-based warning path with no endpoint-level histograms, DB timing, or queue latency accounting.

Evidence:

- Middleware explicitly calls itself a lightweight alternative to APM: `apps/api/src/common/middleware/request-logger.middleware.ts:4`, `apps/api/src/common/middleware/request-logger.middleware.ts:6`
- Slow requests are only counted after crossing a 500ms threshold: `apps/api/src/common/middleware/request-logger.middleware.ts:14`, `apps/api/src/common/middleware/request-logger.middleware.ts:39`, `apps/api/src/common/middleware/request-logger.middleware.ts:42`

Impact:

- You can know that something was slow without knowing whether the problem was DB, Redis, external APIs, queue lag, or application code.
- That is not operational maturity. It is a warning light without a dashboard.

### 40. Medium: the codebase still uses hard caps and partial reads in messaging paths that should scale with relationship depth

Messaging repeatedly caps block checks, membership reads, and related lookups. That keeps endpoints cheap in small rooms and small graphs, but it quietly imposes limits on correctness and fan-out behavior.

Evidence:

- Message list block checks cap at 500: `apps/api/src/modules/messages/messages.service.ts:141`, `apps/api/src/modules/messages/messages.service.ts:144`
- Group creation and member-add paths cap blocks at 1000 and related user lookups at 50/200: `apps/api/src/modules/messages/messages.service.ts:393`, `apps/api/src/modules/messages/messages.service.ts:396`, `apps/api/src/modules/messages/messages.service.ts:405`, `apps/api/src/modules/messages/messages.service.ts:413`, `apps/api/src/modules/messages/messages.service.ts:461`, `apps/api/src/modules/messages/messages.service.ts:464`, `apps/api/src/modules/messages/messages.service.ts:473`, `apps/api/src/modules/messages/messages.service.ts:480`
- Auxiliary messaging reads also use small hard caps on memberships and notes: `apps/api/src/modules/messages/messages.service.ts:703`, `apps/api/src/modules/messages/messages.service.ts:706`, `apps/api/src/modules/messages/messages.service.ts:1164`, `apps/api/src/modules/messages/messages.service.ts:1167`, `apps/api/src/modules/messages/messages.service.ts:1173`, `apps/api/src/modules/messages/messages.service.ts:1182`

Impact:

- Messaging correctness becomes assumption-driven for large groups, high-block users, and more complex social graphs.
- A serious communication product cannot quietly depend on users staying beneath arbitrary relationship thresholds.

### 41. High: account lifecycle semantics are overloaded and risk internal inconsistency

The user lifecycle uses `deletedAt` for two different meanings: a future scheduled deletion date and the timestamp of an actual permanent deletion. That is a semantic smell in a domain where lifecycle state needs to be unambiguous.

Evidence:

- Immediate deletion sets `isDeleted: true` and `deletedAt: new Date()`: `apps/api/src/modules/users/users.service.ts:247`, `apps/api/src/modules/users/users.service.ts:263`, `apps/api/src/modules/users/users.service.ts:264`
- Deletion request uses `deletedAt` as a future scheduled deletion date while `isDeleted` remains false: `apps/api/src/modules/users/users.service.ts:1101`, `apps/api/src/modules/users/users.service.ts:1108`, `apps/api/src/modules/users/users.service.ts:1109`
- Cancel/reactivate then null out the same field: `apps/api/src/modules/users/users.service.ts:1129`, `apps/api/src/modules/users/users.service.ts:1131`, `apps/api/src/modules/users/users.service.ts:1145`, `apps/api/src/modules/users/users.service.ts:1147`

Impact:

- The meaning of `deletedAt` depends on surrounding flags rather than the field itself.
- That invites bugs in analytics, retention jobs, admin tooling, and any future data-policy logic.

### 42. High: auto-publish mutates visibility state without running the rest of the publication pipeline

The scheduling cron publishes overdue content by bulk-nulling `scheduledAt`. It does not appear to trigger the same downstream work normally associated with content becoming live, such as indexing, notifications, or other publication side effects.

Evidence:

- Cron bulk-publishes by `updateMany` on four content tables and only nulls `scheduledAt`: `apps/api/src/modules/scheduling/scheduling.service.ts:240`, `apps/api/src/modules/scheduling/scheduling.service.ts:253`, `apps/api/src/modules/scheduling/scheduling.service.ts:257`, `apps/api/src/modules/scheduling/scheduling.service.ts:261`, `apps/api/src/modules/scheduling/scheduling.service.ts:265`
- The cron logs counts but performs no other follow-up work: `apps/api/src/modules/scheduling/scheduling.service.ts:278`, `apps/api/src/modules/scheduling/scheduling.service.ts:280`
- Elsewhere, normal content creation/deletion paths do have additional notification/index side effects: `apps/api/src/modules/posts/posts.service.ts:109`, `apps/api/src/modules/posts/posts.service.ts:632`, `apps/api/src/modules/posts/posts.service.ts:833`, `apps/api/src/modules/videos/videos.service.ts:185`, `apps/api/src/modules/threads/threads.service.ts:420`

Impact:

- Scheduled content can become visible without the rest of the system fully learning that it has been published.
- Search freshness, notifications, and downstream automation can drift from actual content state.

### 43. Medium: some scheduled and broadcast-style jobs silently serve only a capped subset of users

Several cron-driven or system-wide notification paths stop at arbitrary user caps. They log success as if the job ran for the platform, but they do not actually reach the whole platform.

Evidence:

- Verse of the day fetches up to 10,000 devices, then only notifies the first 1,000 unique users: `apps/api/src/modules/islamic/islamic.service.ts:1957`, `apps/api/src/modules/islamic/islamic.service.ts:1960`, `apps/api/src/modules/islamic/islamic.service.ts:1964`, `apps/api/src/modules/islamic/islamic.service.ts:1975`
- Islamic event reminders fetch up to 10,000 users, then only notify the first 5,000: `apps/api/src/modules/islamic/islamic.service.ts:2011`, `apps/api/src/modules/islamic/islamic.service.ts:2014`, `apps/api/src/modules/islamic/islamic.service.ts:2017`, `apps/api/src/modules/islamic/islamic.service.ts:2028`

Impact:

- Platform-wide messaging becomes first-N delivery rather than full delivery.
- That is not a harmless cap. It is an integrity break disguised as a scale precaution.

### 44. Medium: follower snapshotting silently skips errors and is capped at 50,000 users

The daily follower snapshot job stops at 50,000 users and swallows per-user failures. That makes creator analytics and growth charts quietly incomplete once the platform grows or data anomalies appear.

Evidence:

- Snapshot job caps user scan at 50,000: `apps/api/src/modules/users/users.service.ts:838`, `apps/api/src/modules/users/users.service.ts:841`
- It upserts one user at a time in a loop: `apps/api/src/modules/users/users.service.ts:845`, `apps/api/src/modules/users/users.service.ts:847`
- Failures are skipped silently: `apps/api/src/modules/users/users.service.ts:853`, `apps/api/src/modules/users/users.service.ts:854`

Impact:

- Historical creator metrics can become partially missing without any hard failure.
- Once analytics become user-facing, silent incompleteness is a trust problem, not just an ops problem.

### 45. Medium: data export claims rights-compliance while knowingly truncating output

The community data export path explicitly says users have a right to all their data, then caps each table at 10,000 rows.

Evidence:

- Export comment says users have the right to all their data: `apps/api/src/modules/community/community.service.ts:340`
- The implementation caps posts, threads, and messages at 10,000 each: `apps/api/src/modules/community/community.service.ts:341`, `apps/api/src/modules/community/community.service.ts:347`, `apps/api/src/modules/community/community.service.ts:351`, `apps/api/src/modules/community/community.service.ts:355`

Impact:

- For large accounts, export correctness is knowingly incomplete.
- That is another case where the code is honest in comments and immature in implementation.

### 46. High: the encrypted-messaging trust story is weaker than the product posture implies

The encryption module does not read like a platform that is ready to make strong end-to-end trust claims. It accepts almost any non-trivially long public key, fingerprints whatever base64 decodes out of it, and explicitly admits that safety-number generation is weak.

Evidence:

- Public-key registration only rejects missing keys or strings shorter than 32 characters before hashing decoded bytes: `apps/api/src/modules/encryption/encryption.service.ts:28`, `apps/api/src/modules/encryption/encryption.service.ts:29`, `apps/api/src/modules/encryption/encryption.service.ts:32`
- The code explicitly says the current safety-number generation is weak and should be replaced with a proper Signal-style numeric fingerprint approach: `apps/api/src/modules/encryption/encryption.service.ts:67`, `apps/api/src/modules/encryption/encryption.service.ts:68`, `apps/api/src/modules/encryption/encryption.service.ts:71`
- Conversation encryption status and bulk key reads also rely on small capped reads: `apps/api/src/modules/encryption/encryption.service.ts:109`, `apps/api/src/modules/encryption/encryption.service.ts:120`, `apps/api/src/modules/encryption/encryption.service.ts:188`, `apps/api/src/modules/encryption/encryption.service.ts:196`
- Key-change notification fan-out is also capped to the first 50 memberships: `apps/api/src/modules/encryption/encryption.service.ts:148`, `apps/api/src/modules/encryption/encryption.service.ts:151`

Impact:

- The app can present encrypted-chat posture while the human-verification layer is explicitly known to be weak.
- Key verification and key-change awareness do not yet deserve high-trust messaging claims.
- On a social platform, weak trust UX around private messaging is not a side detail. It is part of the security contract.

### 47. High: auth trust boundaries are still inconsistent with account-state truth

The Clerk integration is incomplete, and the primary auth guard is willing to mutate state and then attach stale user data to the request. The optional auth guard goes even softer and silently downgrades invalid or disallowed identities into anonymous requests.

Evidence:

- The main guard auto-unbans expired bans in the database, then attaches the previously loaded user object to `request.user`: `apps/api/src/common/guards/clerk-auth.guard.ts:44`, `apps/api/src/common/guards/clerk-auth.guard.ts:47`, `apps/api/src/common/guards/clerk-auth.guard.ts:58`
- The guard spec explicitly documents this stale-object behavior after auto-unban: `apps/api/src/common/guards/clerk-auth.guard.spec.ts:236`, `apps/api/src/common/guards/clerk-auth.guard.spec.ts:237`
- The optional guard never throws on invalid tokens and simply omits `request.user`, treating the request as anonymous: `apps/api/src/common/guards/optional-clerk-auth.guard.ts:21`, `apps/api/src/common/guards/optional-clerk-auth.guard.ts:38`, `apps/api/src/common/guards/optional-clerk-auth.guard.ts:42`
- The auth service still carries an explicit TODO for missing Clerk webhook events including `user.updated`, `session.created`, `session.revoked`, and `organization.*`: `apps/api/src/modules/auth/auth.service.ts:293`, `apps/api/src/modules/auth/auth.service.ts:294`, `apps/api/src/modules/auth/auth.service.ts:297`

Impact:

- Request auth state is not fully aligned with authoritative account state.
- Identity sync can drift between Clerk and the app on profile changes, session changes, and organization-related state.
- A public-network platform should not be casual about whether a caller is truly invalid, softly anonymous, or freshly state-mutated mid-request.

### 48. High: wallet state still has an acknowledged split source of truth

The code explicitly documents that there are two balance models and one of them is stale/wrong. That is not a harmless cleanup note. For any social product with tips, gifts, coins, and cashout semantics, that is a ledger-integrity warning.

Evidence:

- The gifts service states that `CoinBalance` is the real balance store and the legacy `User.coinBalance` field is stale/wrong if read: `apps/api/src/modules/gifts/gifts.service.ts:50`, `apps/api/src/modules/gifts/gifts.service.ts:51`, `apps/api/src/modules/gifts/gifts.service.ts:53`
- Gifts, tips, and coin purchases all update `CoinBalance`, reinforcing that the old user field is no longer authoritative: `apps/api/src/modules/gifts/gifts.service.ts:118`, `apps/api/src/modules/gifts/gifts.service.ts:135`, `apps/api/src/modules/payments/payments.service.ts:455`, `apps/api/src/modules/payments/payments.service.ts:544`

Impact:

- Any code path, admin tool, or analytics job that still reads `User.coinBalance` will be wrong.
- Money features should not be allowed to have a known stale mirror field still attached to the main user model.
- This is the kind of debt that quietly turns into balance disputes, support pain, and reconciliation work later.

### 49. High: payment and subscription reconciliation still fall back to heuristics when exact state is missing

The payments layer leans on Redis-backed mappings for webhook reconciliation, then falls back to best guesses when those mappings are gone. In one path the code explicitly updates subscription state with "current date" because it is considered better than leaving stale data.

Evidence:

- Payment-intent and subscription mapping depend on Redis keys with TTLs rather than a durable first-class reconciliation store: `apps/api/src/modules/payments/payments.service.ts:66`, `apps/api/src/modules/payments/payments.service.ts:74`, `apps/api/src/modules/payments/payments.service.ts:83`
- Tip reconciliation falls back from missing mapping to "latest pending tip for sender": `apps/api/src/modules/payments/payments.service.ts:517`, `apps/api/src/modules/payments/payments.service.ts:521`, `apps/api/src/modules/payments/payments.service.ts:524`
- Subscription webhook reconciliation falls back from missing mapping to metadata lookups and re-stores mappings opportunistically: `apps/api/src/modules/payments/payments.service.ts:555`, `apps/api/src/modules/payments/payments.service.ts:560`, `apps/api/src/modules/payments/payments.service.ts:568`
- On Stripe retrieval failure, the code still marks the subscription active and uses `new Date()` as the end date with an explicit "better than leaving stale" comment: `apps/api/src/modules/payments/payments.service.ts:634`, `apps/api/src/modules/payments/payments.service.ts:638`, `apps/api/src/modules/payments/payments.service.ts:641`

Impact:

- Money state recovery is still too guess-driven for a product that wants paid memberships and creator monetization.
- Redis expiry or partial webhook state loss can push the system into approximate rather than exact reconciliation.
- Approximate money state is not maturity. It is deferred accounting pain.

### 50. High: realtime presence correctness is still capped by arbitrary relationship limits

Realtime presence is not actually modeled as "all relevant conversations." It is modeled as "the first 100 conversations we happened to fetch." That is a correctness cap hidden inside a feature that users experience as binary truth.

Evidence:

- On connect, online presence broadcasts only fetch the first 100 conversation memberships: `apps/api/src/gateways/chat.gateway.ts:227`, `apps/api/src/gateways/chat.gateway.ts:230`
- On disconnect, offline presence broadcasts repeat the same 100-membership cap: `apps/api/src/gateways/chat.gateway.ts:308`, `apps/api/src/gateways/chat.gateway.ts:311`
- Live guest listing is also bounded to 50 records: `apps/api/src/modules/live/live.service.ts:377`, `apps/api/src/modules/live/live.service.ts:381`
- Live startup silently swallows stream-provisioning failure and continues with a metadata-only session: `apps/api/src/modules/live/live.service.ts:132`, `apps/api/src/modules/live/live.service.ts:152`

Impact:

- Presence truth degrades for highly connected users exactly where a growing platform should be getting more careful, not less.
- Realtime systems are still coded for flattering graph sizes rather than platform-scale relationship depth.
- A social product that wants to look strong on performance cannot keep shipping correctness caps inside core realtime semantics.

### 51. High: scheduled publication is not a single cross-module contract

The codebase treats "content becomes published" as a field mutation in one place, a notification window in another, and a search/indexing side effect somewhere else. Those definitions do not line up.

Evidence:

- The scheduler publishes overdue content by bulk-nullifying `scheduledAt` across posts, threads, reels, and videos: `apps/api/src/modules/scheduling/scheduling.service.ts:249`, `apps/api/src/modules/scheduling/scheduling.service.ts:253`, `apps/api/src/modules/scheduling/scheduling.service.ts:257`, `apps/api/src/modules/scheduling/scheduling.service.ts:261`
- The post notification cron looks for posts whose `scheduledAt` is still between "five minutes ago" and now, then dedupes and notifies: `apps/api/src/modules/posts/posts.service.ts:88`, `apps/api/src/modules/posts/posts.service.ts:95`, `apps/api/src/modules/posts/posts.service.ts:104`
- Manual content flows do enqueue search-index side effects for posts/reels/videos on create/delete, but the scheduler does not trigger equivalent publication side effects when content crosses from scheduled to live: `apps/api/src/modules/reels/reels.service.ts:276`, `apps/api/src/modules/videos/videos.service.ts:186`, `apps/api/src/modules/posts/posts.service.ts:834`

Impact:

- A scheduled post can become live without the "scheduled post published" notification path ever seeing it.
- Publication side effects depend on which code path made the content visible, not on a single platform publication contract.
- That is inter-module drift at the exact moment users expect deterministic behavior.

### 52. High: notification delivery is wired twice in some flows

`NotificationsService.create()` already triggers push delivery and realtime socket fan-out. Multiple callers then treat notification creation as if it were persistence-only and enqueue a second push job themselves.

Evidence:

- Notification creation directly triggers push and Redis pub/sub fan-out: `apps/api/src/modules/notifications/notifications.service.ts:258`, `apps/api/src/modules/notifications/notifications.service.ts:262`, `apps/api/src/modules/notifications/notifications.service.ts:267`
- Posts then create notifications and separately enqueue push jobs for the same notification id: `apps/api/src/modules/posts/posts.service.ts:632`, `apps/api/src/modules/posts/posts.service.ts:641`, `apps/api/src/modules/posts/posts.service.ts:874`, `apps/api/src/modules/posts/posts.service.ts:879`, `apps/api/src/modules/posts/posts.service.ts:1154`, `apps/api/src/modules/posts/posts.service.ts:1161`
- Follows does the same pattern on follow/follow-request acceptance: `apps/api/src/modules/follows/follows.service.ts:86`, `apps/api/src/modules/follows/follows.service.ts:92`, `apps/api/src/modules/follows/follows.service.ts:124`, `apps/api/src/modules/follows/follows.service.ts:130`, `apps/api/src/modules/follows/follows.service.ts:385`, `apps/api/src/modules/follows/follows.service.ts:391`

Impact:

- Delivery semantics depend on whether a caller remembers that `create()` is already side-effectful.
- This can produce duplicate pushes, uneven retry behavior, and contradictory operational accounting.
- Cross-module contracts should not require every caller to remember hidden downstream behavior.

### 53. High: the internal search indexing contract is already drifting between producers and consumers

The search pipeline is not just vulnerable to external fallback. It has an internal contract mismatch. One producer emits an action the worker does not handle, and major searchable entities still have no visible indexing hooks at all.

Evidence:

- The queue service and worker contract only define `index | update | delete`: `apps/api/src/common/queue/queue.service.ts:91`, `apps/api/src/common/queue/processors/search-indexing.processor.ts:7`, `apps/api/src/common/queue/processors/search-indexing.processor.ts:65`
- `VideosService` enqueues `action: 'upsert'` anyway: `apps/api/src/modules/videos/videos.service.ts:186`, `apps/api/src/modules/videos/videos.service.ts:187`
- The search worker treats unknown actions as warnings, not failures: `apps/api/src/common/queue/processors/search-indexing.processor.ts:82`
- Search is configured with `users` and `channels` indexes, but user/profile/channel mutation paths shown here do not enqueue corresponding user/channel index jobs: `apps/api/src/modules/search/meilisearch.service.ts:39`, `apps/api/src/modules/search/meilisearch.service.ts:47`, `apps/api/src/modules/users/users.service.ts:70`, `apps/api/src/modules/channels/channels.service.ts:56`, `apps/api/src/modules/channels/channels.service.ts:122`

Impact:

- Some search jobs are structurally no-ops even when the queue is healthy.
- If Meilisearch is enabled, the platform can drift into a state where DB truth and search truth disagree for videos, users, and channels.
- Search correctness is not only dependent on external infra; it is already undercut by internal producer/consumer mismatch.

### 54. High: lifecycle truth is inconsistent across product surfaces

The platform does not enforce one consistent rule for whether deactivated, banned, or deleted actors remain visible. Auth and search are stricter than some feed surfaces, which means the same account can disappear in one part of the product and keep showing up in another.

Evidence:

- Search and user-suggestion paths explicitly filter `isBanned`, `isDeactivated`, and `isDeleted`: `apps/api/src/modules/search/search.service.ts:315`, `apps/api/src/modules/search/search.service.ts:316`, `apps/api/src/modules/search/search.service.ts:317`, `apps/api/src/modules/auth/auth.service.ts:244`, `apps/api/src/modules/auth/auth.service.ts:245`, `apps/api/src/modules/auth/auth.service.ts:246`
- Post following feed uses `userId in visibleUserIds` without a matching user-state filter: `apps/api/src/modules/posts/posts.service.ts:251`
- Reel feed only requires `user: { isPrivate: false }` on the main feed path: `apps/api/src/modules/reels/reels.service.ts:319`
- Video feed likewise only requires `user: { isPrivate: false }` on the main feed path: `apps/api/src/modules/videos/videos.service.ts:265`, `apps/api/src/modules/videos/videos.service.ts:267`
- Deactivation paths do exist and are used by auth/account flows: `apps/api/src/modules/auth/auth.service.ts:342`, `apps/api/src/modules/auth/auth.service.ts:350`, `apps/api/src/modules/users/users.service.ts:1093`, `apps/api/src/modules/users/users.service.ts:1109`

Impact:

- Account lifecycle state is not a platform-wide invariant; it is a per-surface opinion.
- A serious social platform cannot afford to have deactivated actors disappear from search while lingering in feed inventory.
- This is cross-surface integrity debt, not a single-query bug.

## Recommendations

### Immediate

1. Fix the mobile compilation error in `apps/mobile/app/(tabs)/bakra.tsx`.
2. Replace fake lint scripts with real `eslint` and `tsc --noEmit` checks.
3. Make Redis absence a hard failure in environments where queues, idempotency, or rate limits matter.
4. Fix webhook dedupe ordering so retries are not lost after partial failure.
5. Correct the broken mobile API wrappers, starting with message forwarding and promotions.
6. Stop booting into fake-success mode when DB, Redis, R2, or Stream prerequisites are missing.
7. Remove or clearly gate TODO-grade worker paths that currently report completion.
8. Eliminate original-media EXIF retention before calling the media pipeline privacy-safe.
9. Reclassify load-bearing services from "recommended" to required in the environments that claim production readiness.
10. Stop testing fake-success infra behavior as if it were a valid contract.
11. Fix personalized-feed pagination so cursor semantics are real, deterministic, and testable.
12. Remove hard 50-item graph caps from exclusion and personalization paths.
13. Move trending/search/ranking hot paths away from slice-then-sort application logic where corpus size matters.
14. Identify every denormalized counter and decide whether it is transaction-critical, repairable, or currently allowed to drift.
15. Replace sequential hot-path fan-out with batchable or queued delivery where the user action can touch many recipients.
16. Add real performance instrumentation instead of relying on threshold logging and ad hoc admin metrics.
17. Separate lifecycle fields for scheduled deletion, deactivation, and permanent deletion so state meaning is explicit.
18. Rebuild scheduled publishing so content publication triggers the same downstream contracts as manual publication.
19. Remove first-N delivery behavior from platform-wide jobs or at minimum mark and meter partial delivery honestly.
20. Stop presenting encrypted messaging as high-trust until key validation, fingerprinting, and safety-number generation are upgraded to something defensible.
21. Make auth guards and Clerk sync state-truthful: no stale attached user objects, no missing lifecycle webhooks, no casual anonymous downgrade where policy should be explicit.
22. Remove legacy wallet balance mirrors or hard-fail any code that still reads them.
23. Replace Redis-TTL payment mappings and heuristic reconciliation with durable, queryable payment state that can survive webhook delays and cache loss.
24. Remove first-100 and first-50 correctness caps from realtime presence and live-state fan-out paths.
25. Define one publication pipeline for scheduled and manual content so search, notifications, and visibility state all change through the same contract.
26. Make notification creation either persistence-only or fully delivery-owning, then remove the duplicate push wiring from callers.
27. Fix the internal search indexing contract immediately: no unsupported actions, no warning-only unknown jobs, and no searchable entity without a producer path.
28. Enforce lifecycle visibility rules consistently across feeds, search, profiles, messaging, and suggestions.

### Next

1. Centralize and enforce sanitization policy for all persisted user text.
2. Harden webhook URL validation against SSRF.
3. Change permissive config fallbacks to secure-default behavior.
4. Add runtime startup validation for required mobile/public env vars.
5. Investigate Jest open handles with `--detectOpenHandles`.
6. Add durable failure accounting for push, search indexing, media processing, and AI jobs.
7. Reconcile health/readiness reporting with actual runtime dependency guarantees.
8. Replace process-local retry helpers with queue-backed or otherwise durable retry paths where guarantees matter.
9. Treat privacy/compliance TODOs around contact sync and severe abuse reporting as launch blockers, not backlog garnish.
10. Unify HTTP and WebSocket origin policy under one explicit, secure-default configuration model.
11. Rework recommendation seen-history so it is content-type-correct across posts, reels, and threads.
12. Add indexing and query-plan review for every endpoint that sorts by engagement in the request path.
13. Build a durable metrics story: per-endpoint latency, DB time, queue lag, push delivery outcomes, cache hit rate, and cross-instance error rate.
14. Audit all social counters and inbox/state summaries for drift, backfillability, and reconciliation jobs.
15. Audit every cron job for capped scans, silent skips, and missing downstream side effects.
16. Replace truncated export/snapshot loops with streaming or resumable backfill pipelines where correctness matters.
17. Define hard platform rules for trust-boundary behavior: when invalid auth should fail, when anonymous downgrade is allowed, and how account-state mutations are reflected in-request.
18. Build a real reconciliation story for balances, tips, subscriptions, and premium state with operator-visible repair paths and invariant checks.
19. Audit every realtime feature for hidden membership caps, partial fan-out, and cross-instance truth drift before claiming scale-readiness.
20. Map every cross-module side effect chain for content creation, publication, deletion, moderation, and account lifecycle so no surface depends on hidden secondary behavior.
21. Add integration tests for platform contracts, not just module behavior: scheduled publish, notification delivery, search indexing, lifecycle deactivation, and search/feed consistency.

## Notes

This audit intentionally focused on defects, regressions, and operational risk rather than feature completeness. The deeper pass did not weaken the original conclusion; it strengthened it. The repo has real breadth, but the most important maturity pattern is still the same: missing dependencies, partial implementations, and background-system failures too often degrade into warnings, fake success, or silent loss of guarantees instead of producing hard, honest failure.
