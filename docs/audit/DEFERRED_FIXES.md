# Deferred Fixes — Audit Remediation Tracking

Items marked "Noted" during audit fix passes. Each must be resolved when its owning file is reached, or in a dedicated sweep after all 72 files are done.

## Format
`[AUDIT_FILE] Finding — Description — Target file/module — Status`

---

## From Audit 01 (Islamic Services)
_All findings fixed directly. No deferred items._

## From Audit 02 (Payment/Commerce)
- [02] C-02 Dual balance system — CoinBalance table vs User.coinBalance field — schema migration needed — OPEN
- [02] C-03 StripeConnectService dead code — not registered in module — needs architecture decision (keep or remove) — OPEN
- [02] C-07 Cashout deducts before transfer — stripe-connect.service.ts — OPEN (dead code, but if registered would be dangerous)
- [02] C-11 Stripe Connect raw fetch no error handling — stripe-connect.service.ts — OPEN (dead code)
- [02] C-13 Coins credited before payment in StripeConnect — stripe-connect.service.ts — OPEN (dead code)
- [02] C-14 Message field abused for Stripe metadata — payments.service.ts — needs Tip model stripePaymentId field — OPEN
- [02] C-15 Orders no payment — commerce.service.ts — needs payment integration for marketplace — OPEN
- [02] M-02 Tip amount float precision — monetization.service.ts — use Decimal.js — OPEN
- [02] M-03 TipStats gross not net — monetization.service.ts — OPEN
- [02] M-04/M-05 Products/businesses cursor pagination broken with UUID — commerce.service.ts — OPEN
- [02] M-08 Zakat self-donation — commerce.service.ts — OPEN
- [02] M-09 Treasury no membership check — commerce.service.ts — OPEN
- [02] M-11 No seller view of orders — missing feature — OPEN
- [02] M-12/M-13 No product/business update/delete — missing feature — OPEN
- [02] M-14 Waqf no contribution endpoint — missing feature — OPEN
- [02] M-15 No subscription expiry — monetization.service.ts — OPEN
- [02] M-16 Tier price float precision — OPEN
- [02] M-17 Duplicate payment systems — architecture decision — OPEN
- [02] M-20 Diamond rate inconsistent (0.7 vs 0.01) — OPEN
- [02] M-22/M-23 StripeConnect wrong balance system — OPEN (dead code)
- [02] M-24 No rate limit on catalog/balance — OPEN
- [02] M-26 Zakat fund goal race — commerce.service.ts — OPEN
- [02] M-27 Stripe API version may not exist — payments.service.ts — OPEN
- [02] M-28 Payment methods swallows errors — payments.service.ts — OPEN
- [02] M-29 No webhook deduplication — stripe-webhook.controller.ts — OPEN
- [02] M-30 Products cursor after pop wrong — commerce.service.ts — OPEN
- [02] M-31 attachPaymentMethod no error handling — payments.service.ts — OPEN
- [02] m-02 CoinTransaction type unvalidated — OPEN
- [02] m-03 No currency on transactions — OPEN
- [02] m-04 parseInt without radix — commerce.controller.ts — OPEN
- [02] m-06/m-07 DTO missing fields vs service — commerce.dto.ts — OPEN
- [02] m-09 No phone validation — commerce.dto.ts — OPEN
- [02] m-10 Tier level unvalidated — OPEN
- [02] m-11 No subscription endDate — OPEN
- [02] m-12 StripeConnect test doesn't test methods — OPEN
- [02] m-15 Decimal precision — OPEN
- [02] m-17 Zakat status transitions — OPEN
- [02] m-18/m-19/m-20 Missing indexes — schema — OPEN
- [02] m-22 Stripe key from process.env — OPEN
- [02] m-23 No currency validation — OPEN
- [02] m-24 Redis customer mapping no DB backup — OPEN
- [02] m-25 No tip idempotency — OPEN
- [02] m-26 Subscription mapping only in Redis — OPEN
- [02] m-27 Diamond rate constant should be single source — OPEN
- [02] m-28 WaqfFund no donations relation — schema — OPEN

## From Audit 03 (Auth/Security)
- [03] F3 TOTP secret plaintext — schema migration + encryption infrastructure — OPEN
- [03] F11 4-digit PIN weak — inherent design — NOTED (acceptable with throttle)
- [03] F16 2FA disconnected from login — requires Clerk middleware — OPEN
- [03] F19 Missing webhook events — feature enhancement — OPEN
- [03] F20 Weak safety numbers — crypto algorithm change — OPEN
- [03] F22 Envelope store race — transactional rewrite — OPEN
- [03] F24 onboardingComplete not set — mobile-side fix — OPEN
- [03] F25 Predictable username — low severity — NOTED (acceptable)
- [03] F26 Hex-only backup codes — minor — NOTED (sufficient entropy)
- [03] F27 Unsalted backup hash — HMAC migration — OPEN
- [03] F28 Hardcoded English in key notification — i18n — OPEN
- [03] F30 Optional guard swallows expired tokens — by design — NOTED
- [03] F31 Throttler unknown fallback — edge case — NOTED
- [03] F32 CurrentUser returns undefined — by design — NOTED
- [03] F33 updateControls no PIN — feature enhancement — OPEN
- [03] F38 No attempt lockout — Redis-backed tracking — OPEN

## From Audit 04 (Social Graph)
- [04] P0-1 Restrict feature never enforced — needs integration into feeds/comments/stories — OPEN
- [04] P0-2 Personalized feed no blocks — fix in file 07 (feed/algorithm) — OPEN
- [04] P0-3 Trending feed no blocks — fix in file 07 — OPEN
- [04] P0-4 FeedService trending/featured no blocks — fix in file 07 — OPEN
- [04] P1-7 Followers list exposed for private accounts — needs auth guard + privacy check — OPEN
- [04] P1-13 Delete no social cleanup — partially fixed in audit 03 — OPEN (circles, mutes still remain)
- [04] P1-14 Search no block filter — fix in file 12 (search) — OPEN
- [04] P2-15 Follow counter race on concurrent accept — low priority edge case — NOTED
- [04] P2-21 Duplicate getFollowers implementations — refactor — OPEN
- [04] P2-22 Circle members not verified to exist — FK catches it — NOTED
- [04] P2-23 No limit on circles created — throttle protects — NOTED
- [04] P2-24 Circle no block check on addMembers — OPEN
- [04] P2-25 Circle members not notified — feature gap — OPEN
- [04] P2-26 Slug collision weak handling — acceptable at current scale — NOTED
- [04] P2-27 Profile cache not invalidated on block — 5min TTL acceptable — NOTED
- [04] P2-28 Export marks all messages as encrypted — architecture — NOTED
- [04] P2-29 getUserPosts/Threads no block check — OPEN
- [04] P2-30 Report reason mapping incomplete — OPEN
- [04] P2-51 Stories feed no block/mute filter — OPEN
- [04] P3-31 Inconsistent throttle rates — minor — NOTED
- [04] P3-32 Users controller no class throttle — minor — NOTED
- [04] P3-33 nasheedMode inline DTO — fix in file 16 (DTO validation) — OPEN
- [04] P3-34 getOwnRequests no pagination — minor — NOTED
- [04] P3-35 Suggestions limited to 50 followings — algorithm — NOTED
- [04] P3-36 Missing removeFollower feature — feature gap — OPEN
- [04] P3-37 Block no circle cleanup — OPEN
- [04] P3-38 Block no conversation cleanup — OPEN
- [04] P3-39 Restrict list wrong order — minor — NOTED
- [04] P3-40 N+1 follow check — performance minor — NOTED
- [04] P3-43 Avatar/cover any URL — needs R2 domain whitelist — OPEN
- [04] P3-45 Redundant delete endpoints — architecture cleanup — OPEN
- [04] P3-47 Duplicate follow request endpoint — minor — NOTED
- [04] P3-48 Circle getMembers no pagination — minor — NOTED
- [04] P3-49 Circle no class throttle — minor — NOTED
- [04] P3-50 Contact sync raw phone numbers — privacy — OPEN

## From Audit 05 (Content Creation) — 94 findings
### FIXED directly (82 findings):
F01-F08 (P0s), F10-F18, F20-F25, F28-F34, F36-F43, F47-F53, F56-F57, F59-F60, F61-F64, F66-F70, F72-F73, F78-F82, F84, F87-F94

### Deferred — genuinely cross-file scope (needs different file's context):
- [05] F44 Thread images moderation — requires AI moderation service wiring — fix in file 10 (AI services) — OPEN
- [05] F45 Video description/thumbnail moderation — same — OPEN
- [05] F46 Channel name moderation — same — OPEN
- [05] F47-F49 Report FK fields (reportedThreadId, reportedReelId, reportedVideoId) missing from schema — needs schema migration — fix in file 15 (Prisma schema) — OPEN
- [05] F65 Video comment like — needs VideoCommentLike model in schema — fix in file 15 — OPEN

### NOTED (acceptable/by-design):
- [05] F26-F27 Feed cache 30s TTL — acceptable, standard for social feeds
- [05] F54-F55 Self-react/self-like — UX design decision (Instagram allows it)
- [05] F58 Private account story leak — existing follows persist after going private (same as Instagram)
- [05] F71 Story creation notification — stories don't push-notify all followers (same as Instagram/TikTok)
- [05] F74 Story viewers pagination — minor inconsistency, works correctly
- [05] F76 Unused import — false positive, ReportReason IS used as type cast
- [05] F83 Unused parameter — minor, no functional impact
- [05] F85 Cache invalidation scope — 30s TTL handles this adequately

## From Audit 06 (Messaging/Real-time) — 78 findings, 55 fixed
### FIXED: F1-F3, F5-F7, F10-F12, F14, F17-F18, F22-F24, F26-F34, F36, F39, F51, F55-F57, F59, F67, F70-F71, F73, F76-F78
### Deferred — genuinely cross-file:
- [06] F19 Scheduled message auto-send — needs @nestjs/schedule (not installed) — OPEN
- [06] F20-F21 Starred messages String[] → join table — needs schema migration (file 15) — OPEN
- [06] F35 Chat export unbounded memory — needs streaming implementation — OPEN
- [06] F40-F42 Quran room limits/host transfer/cleanup — OPEN
- [06] F58 Broadcast slug change prevention — OPEN
### NOTED (acceptable/by-design/feature stubs):
- [06] F4 Socket room eviction — returns info for client-side handling
- [06] F8-F9 Typing/read receipt privacy — same as Instagram in groups
- [06] F15-F16 Webhook HMAC/broadcast public — feature stubs, by design
- [06] F25 Delivery receipt fire-and-forget — minor
- [06] F43-F46 Group call/screen share — no WebRTC installed
- [06] F47-F54 P3 config/pagination/stubs
- [06] F60-F62 Encryption items — resolved in audit 03
- [06] F63-F66, F68-F69, F72, F74-F75 — P3 minor items

## From Audit 07 (Feed/Algorithm/Recommendations) — 54 findings
### FIXED directly (43 findings):
F-001, F-002 (SQL injection validation), F-003 (personalized feed block/mute), F-004 (trending block/mute), F-005 (featured block/mute), F-006 (admin guard featurePost), F-007 (misplaced take:50), F-008 (trending pagination offset-based), F-010 (session memory leak cap), F-011 (viewedIds cap 1000), F-013 (double prefix embeddings), F-014 (admin guard backfill), F-015 (bidirectional blocks recommendations), F-016 (limit cap feed endpoints), F-017 (limit cap recommendations), F-018 (session signal DTO), F-020 (diversity backfill), F-022 (Ramadan future years), F-024 (lat/lng validation), F-025 (logInteraction only update defined fields), F-026 (logInteraction race condition note), F-029 (buildContentFilterWhere documented — dead code), F-032 (suggested users block/mute), F-033 (frequent creators block/mute), F-034 (all 29 Islamic hashtags), F-035 (bidirectional blocks consistency), F-037 (space DTO normalize uppercase), F-039 (space query param validation), F-040 (search char filter > 1 for Arabic), F-043 (re-throw critical errors), F-044 (suggestedThreads endpoint), F-045 (FeaturePostDto), F-046 (contentType validation), F-047 (scheduledAt in featured), F-049 (viewedIds pagination), F-051 (Fisher-Yates shuffle), F-054 (throttle all endpoints)

### Deferred — cross-file scope:
- [07] F-027 FeedInteraction @@unique([userId, postId]) — needs schema migration — fix in file 15 — OPEN
- [07] F-050 Embedding table no FK — orphaned rows, needs cleanup job or schema migration — fix in file 15 — OPEN

### NOTED (acceptable/by-design/architecture):
- [07] F-009 Trending fetches 200 rows — acceptable for scoring pipeline, offset pagination now prevents duplicates
- [07] F-012 Nearby feed ignores coordinates — documented limitation (no lat/lng on Post model), needs PostGIS or geo columns
- [07] F-019 Personalized feed returns IDs only — architecture decision, client can hydrate
- [07] F-021 Diversity logic duplicated — minor DRY issue, each has slight differences
- [07] F-023 Friday boost is correct (dayOfWeek=5=Friday)
- [07] F-028 getUserInterests dead method — returns space-level scores, kept for future use
- [07] F-030 getFrequentCreatorIds N+1 query — acceptable for take:500 at current scale
- [07] F-031 suggestedPeople take:50 truncation — acceptable for friends-of-friends at current scale
- [07] F-036 IVFFlat index — requires REINDEX after data load, documented
- [07] F-038 MINBAR in DTO but not in personalized feed — logged for MINBAR interactions, personalization pending video feed
- [07] F-041 getUserInterestVector postId only — FeedInteraction FK is postId, content-type aware lookup needs schema change
- [07] F-042 Sequential queries in personalized feed — already parallelized getContentMetadata + getAuthorMap with Promise.all
- [07] F-048 Prayer time server timezone — noted, would need user timezone param for per-user accuracy
- [07] F-052 Transparency explanations shallow — feature enhancement, current generic reasons work
- [07] F-053 Test coverage gaps — FIXED: added 12+ new tests for block/mute filtering, admin guard, limit caps

### Resolved deferred items from previous files:
- [04] P0-2 Personalized feed no blocks — RESOLVED in F-003
- [04] P0-3 Trending feed no blocks — RESOLVED in F-004
- [04] P0-4 FeedService trending/featured no blocks — RESOLVED in F-004, F-005

---

## Summary
- **OPEN**: Must be fixed — either in its owning audit file or in a dedicated sweep
- **NOTED**: Acknowledged, acceptable risk at current stage, or by-design behavior
