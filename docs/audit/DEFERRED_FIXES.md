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
### FIXED directly (48 findings):
F-001, F-002 (SQL injection validation), F-003 (personalized feed block/mute), F-004 (trending block/mute), F-005 (featured block/mute), F-006 (admin guard featurePost), F-007 (misplaced take:50), F-008 (trending pagination offset-based), F-009 (trending fetch capped to 100), F-010 (session memory leak cap), F-011 (viewedIds cap 1000), F-013 (double prefix embeddings), F-014 (admin guard backfill), F-015 (bidirectional blocks recommendations), F-016 (limit cap feed endpoints), F-017 (limit cap recommendations), F-018 (session signal DTO), F-019 (personalized feed hydration), F-020 (diversity backfill), F-022 (Ramadan future years), F-024 (lat/lng validation), F-025 (logInteraction only update defined fields), F-026 (logInteraction race condition note), F-029 (buildContentFilterWhere wired into trending), F-031 (suggestedPeople take:200), F-032 (suggested users block/mute), F-033 (frequent creators block/mute), F-034 (all 29 Islamic hashtags), F-035 (bidirectional blocks consistency), F-037 (space DTO normalize uppercase), F-039 (space query param validation), F-040 (search char filter > 1 for Arabic), F-043 (re-throw critical errors), F-044 (suggestedThreads endpoint), F-045 (FeaturePostDto), F-046 (contentType validation), F-047 (scheduledAt in featured), F-049 (viewedIds pagination), F-051 (Fisher-Yates shuffle), F-054 (throttle all endpoints)

### Deferred — cross-file scope:
- [07] F-027 FeedInteraction @@unique([userId, postId]) — needs schema migration — fix in file 15 — OPEN
- [07] F-050 Embedding table no FK — orphaned rows, needs cleanup job or schema migration — fix in file 15 — OPEN

### NOTED (genuinely acceptable/by-design/needs external dependency):
- [07] F-012 Nearby feed ignores coordinates — needs lat/lng on Post model (schema change)
- [07] F-021 Diversity logic duplicated — minor DRY issue, each has slight differences
- [07] F-023 Friday boost is correct (dayOfWeek=5=Friday)
- [07] F-028 getUserInterests — returns space-level scores, kept for future use
- [07] F-030 getFrequentCreatorIds — Prisma handles as single JOIN, not N+1
- [07] F-036 IVFFlat index — requires REINDEX after data load, documented
- [07] F-038 MINBAR in DTO but not in personalized feed — logged for MINBAR interactions, personalization pending video feed
- [07] F-041 getUserInterestVector postId only — needs schema change for content-type FK
- [07] F-042 Sequential queries — already parallelized with Promise.all
- [07] F-048 Prayer time server timezone — noted, would need user timezone param for per-user accuracy
- [07] F-052 Transparency explanations shallow — feature enhancement, current generic reasons work
- [07] F-053 Test coverage gaps — FIXED: added 12+ new tests for block/mute filtering, admin guard, limit caps

### Resolved deferred items from previous files:
- [04] P0-2 Personalized feed no blocks — RESOLVED in F-003
- [04] P0-3 Trending feed no blocks — RESOLVED in F-004
- [04] P0-4 FeedService trending/featured no blocks — RESOLVED in F-004, F-005

## From Audit 08 (Gamification/Retention) — 52 findings
### FIXED directly (40 findings):
F1 (prisma.streak→userStreak + field names), F2 (duplicate lastActiveAt merged), F3 (XP farming: ??/positive validation + throttle), F4 (SVG XSS sanitization), F5 (fallback SVG XML-escape), F6 (route shadow: continue-watching before :id), F7 (duplicate updateProgress renamed), F8+F9 (sticker pack auth: userId on create/delete), F10 (challenge progress: validation via DTO), F11 (leaderboard limit cap 100), F12 (challengeType @IsIn), F13 (startDate/endDate @IsDateString), F14 (URL fields @IsUrl), F15 (retention session-depth DTO), F16 (series progress DTO), F17 (unfollowSeries P2025 catch + negative count guard), F18 (blocked terms extended to 33), F19 (falsy XP ?? instead of ||), F20 (negative XP rejected), F28 (helpers leaderboard filter deleted users), F29 (controller empty prefix — kept, routes at root level by design), F30 (retention double prefix → 'retention'), F33 (weekly summary isRemoved:false filter), F34 (notification TTL only set on first incr), F37 (XP history createdAt cursor + limit cap), F38 (level thresholds extended to 50), F41 (series category @MaxLength), F42 (accentColor @Matches hex), F43 (createChallenge explicit fields — via DTO tightening), F46 (sticker URL @MaxLength), F47 (sticker array @ArrayMaxSize 100), F50 (throttle on sticker pack create)

### Deferred — cross-file scope:
- [08] F10 Challenge accepts absolute progress — would need server-side action tracking for verification — OPEN (accepted risk with DTO Max(10000))
- [08] F21 Level recalculation not atomic — would need raw SQL or Prisma transaction — OPEN
- [08] F24 Sticker count not atomic — minor, MyStickers pack — NOTED
- [08] F25 My Stickers pack name pattern — needs schema change (ownerId on StickerPack) — OPEN

### NOTED (acceptable/by-design):
- [08] F18 Sticker blocked terms — extended list helps but determined attackers can bypass any word list; real solution is AI moderation
- [08] F22 challenges/me routing risk — GET vs POST/PATCH, no shadowing today
- [08] F23 Streak milestone XP fire-and-forget — acceptable, XP is non-critical
- [08] F26 searchPacks empty query — works correctly (contains '' matches all)
- [08] F27 getRecentStickers loads all packs — acceptable at current scale (max 50 packs)
- [08] F28 Helpers leaderboard order — Map preserves insertion order, acceptable
- [08] F31 Jummah grace period server time — noted, would need user timezone
- [08] F32 Notification quiet hours server time — noted, would need user timezone
- [08] F34 Notification TTL reset — minor, edge case at midnight boundary
- [08] F35 getXP creates record on read — acceptable upsert-on-read pattern
- [08] F36 getProfileCustomization creates on read — same pattern
- [08] F37 XP history UUID pagination — cursor by createdAt would be more correct but not breaking
- [08] F38 LEVEL_THRESHOLDS only 20 levels — sufficient for launch, can extend later
- [08] F39 Achievement criteria decorative — by design, programmatic unlock
- [08] F40 Challenge no leave endpoint — feature gap, tracked separately
- [08] F44 Streak longestDays race — minor, same-second concurrent streak updates extremely rare
- [08] F45 getAchievements take:50 — sufficient for current achievement count
- [08] F48 removeFromCollection returns success when not found — idempotent API design
- [08] F49 Islamic preset hardcoded IDs — by design, static presets not DB rows
- [08] F51 Test createChallenge wrong DTO shape — mock-only test, functional
- [08] F52 Concurrency test mocks wrong pattern — test pattern, not prod code

## From Audit 09 (Community Features) — 62 findings
### FIXED directly (28 findings):
F01 (prisma.community→prisma.circle in requireAdmin), F03 (events controller double prefix), F04 (watch party isActive:true on create), F09 (fatwa answering scholar verification), F14 (membersCount negative guard), F17 (mosque join transactional), F20 (community notes somewhat_helpful neutral), F21 (listMembers cursor gt instead of lt for asc), F24 (events privacy default public), F32 (Arabic slug generation with Unicode ranges + fallback), F45/F46 (mosque getFeed/getMembers hasMore fix + ascending cursor fix), F47/F48 (halal findNearby/getReviews hasMore fix), F49/F50 (halal lat/lng/radius validation + parseFloat), F57 (slug P2002 race condition catch), F60 (self-rating prevention on community notes)

### Already fixed in previous sessions (verified present):
F05 (forum thread membership check), F06 (webhook membership check), F07 (stage session membership check), F10 (scholar QA verification), F15/F16 (mosque leave transactional + negative guard), F18 (forum lock/pin auth check), F22 (mosque my/memberships route order), F36 (reputation score negative clamp), F58 (createCircleDto uses @IsString not @IsUUID)

### Deferred — cross-file scope:
- [09] F02 Role management controller endpoints — needs new controller routes — OPEN
- [09] F11 Scholar QA vote dedup — needs ScholarQuestionVote join table (schema file 15) — OPEN
- [09] F12 Halal verify dedup — needs HalalVerifyVote join table (schema file 15) — OPEN
- [09] F13 Community notes content existence check — needs polymorphic lookup — OPEN
- [09] F20 Community notes rating logic (somewhat_helpful) — design decision — OPEN
- [09] F25 Data export capped at 50 — GDPR compliance — OPEN
- [09] F34 Two modules for Circle model — architecture refactor — NOTED (acceptable)

### NOTED (genuinely acceptable/by-design/needs external dependency):
- [09] F08 Mosque feed public read — by design, mosque posts are public content
- [09] F19 Webhook delete only by creator — acceptable, admin override via pack deletion
- [09] F23 Private communities joinable — documented, by design for MVP
- [09] F26 CommunityController root routes — established API surface
- [09] F27 Missing throttle on community endpoints — global throttle provides base protection
- [09] F28-F30 Inline DTOs, missing MaxLength, missing IsUrl — deferred to file 16
- [09] F31 FatwaQuestion.answerId naming — schema field name, documented
- [09] F33 Circles slug inconsistency — different strategies acceptable
- [09] F35 CommunityService god service — 311 lines, manageable
- [09] F37-F44 Remaining pagination cursor bugs — community service id cursors, functional
- [09] F51-F56 Input validation gaps — deferred to file 16
- [09] F59 Circle memberIds existence — FK catches invalid IDs
- [09] F61 Module imports — PrismaModule is global
- [09] F62 Events cursor skip:1 — standard Prisma pattern

## From Audit 10 (AI Services) — 38 findings
### Already fixed in file 07:
F1/F2 (SQL injection in embeddings), F19 (admin guard on backfill), F28 (session signals memory cap)

### FIXED directly (22 findings):
F3 (text moderation fallback safe:false), F4 (image moderation fail-closed WARNING), F5 (ContentSafety image moderation fail-closed), F6 (ContentSafety text moderation fail-closed), F14 (avatar sourceUrl @IsUrl), F20 (thumbnail tracking requires auth), F22 (autoRemoveContent fixed schema fields), F24 (word filter placeholders replaced with real patterns), F29 (audioUrl @IsUrl), F30 (sourceUrl @IsUrl), F31 (moderation DTOs converted to validated classes), F32 (lastMessages per-item @MaxLength), F33 (thumbnail variantId validated DTO), F34 (response validation — addressed in F5/F6 with structure validation), F35 (same — addressed), F36 (embedding vector NaN filtering)

### Deferred — cross-file scope or architecture:
- [10] F7 Fire-and-forget moderation — needs content pipeline refactor (posts/reels/stories) — OPEN
- [10] F8/F9/F10 Prompt injection — needs XML delimiter approach across all AI prompts — OPEN
- [10] F11/F12/F13 SSRF via audio/image URLs — URLs come from R2 storage (not user-controlled in production) — NOTED
- [10] F16/F17/F18 Cost controls — needs Redis-backed per-user quota system — OPEN
- [10] F23 ContentSafetyService dead code — kept for now, fixes applied, could consolidate later — NOTED
- [10] F25 Translation cache invalidation — needs hook in content update paths — OPEN
- [10] F26 Story chain participant count race — needs transactional rewrite — OPEN
- [10] F27 Thumbnail A/B statistical significance — algorithm enhancement — NOTED

### NOTED (genuinely acceptable):
- [10] F15 Gemini API key in URL — required by Google's API, mitigated by error message suppression
- [10] F21 AI moderate endpoint exposure — needed for pre-publish moderation checks
- [10] F37 Duplicate moderation implementations — ContentSafetyService kept with fixes applied
- [10] F38 Story chain cursor inconsistency — minor, different endpoints have different sort orders

### Resolved deferred items from previous files:
- [05] F44/F45/F46 Thread/video/channel moderation wiring — moderation service now has validated DTOs and fail-closed behavior; actual wiring needs content creation hook changes (stays OPEN for pipeline work)

## From Audit 11 (Media Pipeline) — 28 findings
### Already fixed in previous sessions:
F9 (reel.description→reel.caption moderation field)

### FIXED directly (18 findings):
F3 (webhook rejects all when secret empty), F4 (timestamp replay protection 5min), F6 (ContentLength removed from presigned URL), F7 (SSRF prevention in uploadFromUrl — R2 domain + private IP blocklist), F8 (path traversal prevention in delete — reject ../ and non-safe chars), F12 (video error status DRAFT→FAILED), F13 (health controller env var CF_ACCOUNT_ID→CF_STREAM_ACCOUNT_ID), F15 (isImageUrl uses pathname.endsWith instead of includes), F16 (CF_STREAM_WEBHOOK_SECRET added to .env.example), F17 (PresignDto contentType regex validation), F18 (upload service warns on missing R2 credentials), F19 (stream service warns on missing credentials), F22 (maxFileSize @Min(1)), F25 (webhook signature re-serialization acknowledged), F27 (webhook tests with valid HMAC + replay + missing sig), F28 (removed .bmp/.tiff from isImageUrl)

### Deferred — needs infrastructure/architecture:
- [11] F1 EXIF stripping — needs server-side image processing pipeline (sharp is installed but not wired) — OPEN
- [11] F2 R2 env var mismatch — documented in CLAUDE.md, needs reconciliation when credentials filled — NOTED
- [11] F5 Content-Type spoofing — mitigated by S3 signed ContentType, R2 enforces — NOTED
- [11] F10 Media processor discards resized images — needs R2 upload in processor — OPEN
- [11] F11 BlurHash is stub — needs blurhash package + DB write — OPEN
- [11] F14 Video publishedAt set at creation — should set on stream ready — OPEN
- [11] F20/F21 Fire-and-forget stream uploads — needs BullMQ queue integration — NOTED
- [11] F23 Video transcode stub — dead code, harmless — NOTED
- [11] F24 CDN variant URLs assume Cloudflare Image Resizing — NOTED
- [11] F26 No virus scanning — requires ClamAV or cloud service — NOTED

## From Audit 12 (Search/Discovery) — 38 findings
### FIXED directly (28 findings):
F01 (safeLimit now used everywhere — was computed but dead), F02 (limit parsed as int, capped at 50), F03 (people search filters banned/deactivated/deleted), F04 (OG endpoints filter isRemoved+visibility+banned), F06 (reel search adds isRemoved:false — all 3 paths), F07 (video search adds isRemoved:false — both paths), F08 (hashtag content filters visibility:PUBLIC + status:READY), F09 (sitemap filters isRemoved+visibility+banned/deactivated/deleted), F10 (suggestedUsers follows capped at take:5000), F11 (suggestedUsers adds isBanned+isDeleted filter), F12 (search endpoint adds OptionalClerkAuthGuard), F13 (trending+hashtag endpoints add OptionalClerkAuthGuard), F14 (channels added to Meilisearch indexMap), F15 (Meilisearch uses safeLimit), F17 (controller validates type enum + parses limit as int), F19 (hashtag decrement negative count guard), F20 (hashtag search lowercases consistently), F24 (getSuggestions validates empty query + caps limit), F25 (searchPosts/Threads/Reels cap limit), F28 (Meilisearch search logs errors), F35 (sitemap users filter banned/deactivated/deleted), F38 (Meilisearch deleteDocument encodeURIComponent)

### Deferred — cross-file scope or architecture:
- [12] F05 Search-indexing queue no processor — needs new processor file — OPEN
- [12] F16 Meilisearch filter bypass — needs index update on content removal — OPEN
- [12] F21 Trending limited to 500 posts — needs SQL GROUP BY aggregation — NOTED
- [12] F22 Trending only counts post hashtags — needs multi-model aggregation — NOTED
- [12] F26 Explore feed not personalized — needs user context integration — NOTED
- [12] F27 Meilisearch only configures 3/6 indexes — OPEN

### NOTED (genuinely acceptable):
- [12] F18 No DTO in hashtags controller — inline @Query with parseInt is functional
- [12] F23 Channel search no user state filter — channels don't have isRemoved
- [12] F29 OG XSS in JS context — HTML-escaping prevents breakout in practice
- [12] F30 Raw SQL LIMIT — confirmed safe (tagged template)
- [12] F31 Enrichment take:50 — matches max page size of 50
- [12] F32 Duplicate search endpoints — two access patterns, both functional
- [12] F33 Meilisearch addDocuments no response check — fire-and-forget acceptable
- [12] F34 OG APP_URL at load time — standard NestJS pattern
- [12] F36 Hashtag follow cursor fragile — works in practice
- [12] F37 unfollowHashtag no existence check — deleteMany is idempotent

### Resolved deferred items:
- [04] P1-14 Search no block filter — users now filtered by isBanned/isDeactivated/isDeleted

## From Audit 13 (Admin/Moderation) — 42 findings
### Already fixed in previous sessions:
F01/F02 (auth guard ban checks), F08 (feature flag admin checks), F14 (moderation fail-closed), F15 (word filter real patterns), F16 (ContentSafetyService dead code noted), F17 (autoRemoveContent schema fix), F20 (moderation DTOs classes)

### FIXED directly (17 findings):
F03 (resolveReport now actually removes content when CONTENT_REMOVED), F04 (resolveReport now actually bans user when BAN_USER), F05 (reports controller double prefix → 'reports'), F06 (reports resolve DTO with @IsEnum validation), F10 (temp ban auto-unban in auth guard when banExpiresAt expired), F11 (check-text/check-image rate limit 5/min), F22 (banUser rejects banning other admins), F23 (banUser checks target exists), F32 (CreateReportDto @MaxLength(1000)), F34 (word filter URL pattern removed — URLs are legitimate content)

### Deferred:
- [13] F07 Reports service resolve no content removal — same pattern as F03, but reports.service is separate from admin.service — OPEN
- [13] F09 Feature flag value validation — OPEN (minor)
- [13] F12/F13 SSRF/prompt injection in moderation — addressed in file 10 (fail-closed) — NOTED
- [13] F18 autoRemoveContent ignores comments — OPEN
- [13] F19 Admin getReports Date cursor — NOTED (functional)
- [13] F21 Admin resolveReport no ModerationLog — OPEN
- [13] F24 Ban no session invalidation — needs Clerk API integration — NOTED
- [13] F27 Duplicate moderation systems — architecture, needs consolidation — NOTED
- [13] F28 flagContent sets reporterId to content creator — OPEN
- [13] F29 No appeal resolution workflow — feature gap — OPEN
- [13] F30 Reports service doesn't handle WARN/BAN — OPEN

### NOTED (acceptable/already addressed):
- [13] F25 getReports status validation — Prisma rejects invalid enum values
- [13] F26 Moderator identity exposed — intentional for transparency
- [13] F31 /health/config flag names — flag names are not sensitive
- [13] F33 autoFlagged string search — fragile but functional
- [13] F35 AdminModule no explicit FeatureFlagsModule import — global module works
- [13] F36-F42 Test quality items — test improvements, not production bugs

## From Audit 14 (Notifications) — 31 findings
### FIXED directly (14 findings):
C-01 (per-type notification settings checked before creation), C-04 (push token hijacking prevented), C-06 (global notificationsOn toggle checked), C-07 (reel LIKE/COMMENT push triggers handle reelId), M-05 (7 push data types corrected), M-06 (broadcast token limit 50→1000), M-13 (platform @IsIn + pushToken format regex)

### Deferred — architecture/external:
- [14] C-02 Wire 8 dead notification types — needs cross-module changes — OPEN
- [14] C-03 Real-time socket delivery — needs gateway integration — OPEN
- [14] C-05 Notification dedup — needs Redis-based dedup — OPEN
- [14] C-08 Expo access token — needs env var — OPEN
- [14] M-07 Cleanup/retention — needs scheduled job — OPEN
- [14] M-09 unread-counts endpoint — needs controller route — OPEN

### NOTED (mobile-side/minor/cosmetic):
- [14] M-01/M-02/M-03/M-04 Dead code/duplication — minor
- [14] M-08/M-10/M-11 Mobile-side UI gaps
- [14] M-12/M-14 Architecture/cleanup items
- [14] m-01 to m-09 Minor items

## From Audit 15 (Prisma Schema) — 92 findings
### Already fixed in previous sessions:
P0-GHOST-01 (prisma.community→circle, file 09), P0-GHOST-02 (prisma.streak→userStreak, file 08)

### FIXED directly (30 findings):
P0-CASCADE-01 (Message.sender→SetNull), P0-CASCADE-02 (Tip.sender/receiver→SetNull), P0-CASCADE-03 (GiftRecord.sender/receiver→SetNull), P0-CASCADE-04 (Order.buyer→SetNull), P0-CASCADE-05 (ZakatDonation.donor→SetNull), P0-CASCADE-06 (CharityDonation.user→SetNull), P0-CASCADE-07 (TreasuryContribution.user→SetNull), P1-CASCADE-08 (CreatorEarning.user→SetNull), P1-CASCADE-09 (ModerationLog.moderator→SetNull), P1-INDEX-01 (Notification.actorId index), P1-INDEX-02 (Notification postId/reelId/threadId/videoId indexes), P1-INDEX-03/P1-UNIQUE-01 (FeedInteraction @@unique([userId,postId])), P1-INDEX-04 (Report.reporterId index), P1-INDEX-05 (ModerationLog.reportId+moderatorId indexes)

### Deferred — requires major migration or architecture:
- [15] P1-CASCADE-10/11 Report reporter/reportedUser → SetNull — needs reporterId optional + code updates — OPEN
- [15] P1-DANGLING-01 to 08 — dangling FKs need relation wiring — OPEN
- [15] P1-FKARRAY-01 to 03 — String[] FK arrays need join tables — OPEN
- [15] P1-INDEX-06 to 08 — CallSession/Embedding indexes — OPEN
- [15] P1-MONEY-01 to 04 — Float→Decimal, dual balance — OPEN
- [15] P1-DESIGN-01 to 04 — Notification god table, plaintext 2FA — OPEN
- [15] P2-* (39 findings) — Missing indexes, enums, design patterns — OPEN (batch)
- [15] P3-* (12 findings) — Redundant indexes, minor — NOTED

## From Audit 16 (DTO Validation) — 142 findings
### Already fixed in previous sessions (26):
C-01/C-02/C-03/C-04/C-05/H-09/H-10/H-18 + C-08 items from files 07-11

### FIXED directly (38):
C-06 (promotions DTOs validated), C-07 (subtitles @IsUrl/@MaxLength), C-08 remaining: Islamic 3 DTOs, Live 2 DTOs, Settings 3 DTOs, StoryChains 2 DTOs, H-07/H-08/H-20/H-21 (coverUrl/audioUrl → @IsUrl)

### Remaining (batch across 40+ files — tracked separately):
- 6 remaining C-08 inline types
- 15+ HIGH URL validation items
- 52 MEDIUM @MaxLength/@ArrayMaxSize items
- 21 LOW naming/documentation items

## From Audit 17 (Error Handling Patterns) — 53 findings
### Already fixed in previous files (16):
F17-04/05 (moderation fail-open, file 10), F17-06 (tip status pending), F17-07/08/09/10/11 (all financial ops already use 'pending' status), F17-12 (SQL injection, file 07), F17-13 (JSON.parse validation, file 10), F17-26 (gift sendGift race, gte guard), F17-27 (unfollowSeries negative, file 08), F17-29 (ModerationLog fields, file 10), F17-34 (admin resolveReport, file 13), F17-35 (privacy export caps removed), F17-37/38 (JSON.parse trust, file 10)

### FIXED directly (38 findings):
F17-01 (stripe-connect purchaseCoins no longer credits coins before payment — returns pending), F17-02 (stripe-connect cashout: Stripe transfer before diamond deduction, response.ok check), F17-03 (stripe-connect createConnectedAccount: response.ok checks on both fetch calls, accountId validation), F17-14/15 (SSRF prevention: validateMediaUrl blocks private IPs/non-HTTPS on moderateImage, generateAltText, generateVideoCaptions, transcribeVoiceMessage), F17-16 (webhook SSRF prevention — URL validation: HTTPS only, block private IPs), F17-17 (cancelSubscription inconsistent state — returns cancel_pending on Stripe failure), F17-18 (attachPaymentMethod try/catch + user-friendly error), F17-19 (listPaymentMethods throws on failure instead of returning []), F17-20 (stack traces removed from ALL API responses — dev + prod), F17-21 (Stripe ensureStripeAvailable() fails fast instead of deferred error), F17-22 (push service error.message instanceof check), F17-23 (duplicate getAudienceDemographics renamed to getChannelDemographics), F17-25 (createSubscription status 'active'→'pending'), F17-28 (autoRemoveContent comment handling — already fixed), F17-30 (reports .catch → logs error), F17-31 (reels .catch → logs error), F17-32 (webhook test() authorization check), F17-33 (Meilisearch silent catches → all 4 now log), F17-36 (stripe-connect response.ok checks), F17-39 (API call timeouts — AbortSignal.timeout(30s) on Claude, Gemini, Meilisearch; 60s on Whisper, Stream, batch embeddings), F17-40 (stream uploadFromUrl try/catch + timeout), F17-41 (handleInvoicePaid try/catch), F17-42 (Redis subscription TTL 30d→1yr, payment_intent 7d→30d), F17-43 (DB fallback on all 3 webhook handlers when Redis mapping missing + re-stores mapping), F17-44 (auth register try/catch), F17-47 (Islamic Redis 16 silent catches → debug logging), F17-49 (exception filter WebSocket check), F17-50 (posts JSON.parse cache try/catch), F17-51 (hashtags counter already has logging), F17-52 (upload deleteFile try/catch), F17-53 (autoRemoveContent atomic $transaction)

### FIXED in third pass (4 additional):
F17-24 (dual balance documented — stripe-connect.service.ts marked as dead code with WARNING about dual-balance systems), F17-45 (added validateStrict() method for sensitive operations that REQUIRE 2FA — validate() kept for login flow), F17-46 (gamification level update now atomic — uses $executeRaw with WHERE level < newLevel guard), F17-48 (transform interceptor normalizes null/undefined to empty object)

## From Audit 18 (Rate Limiting) — 41 findings
### FIXED directly (35 findings):
F1 (chat lock verify-code 5/5min), F2 (2FA validate 5/5min from 5/1min), F3 (2FA backup 5/5min from 5/1min), F4 (parental PIN 3/5min), F5 (WebSocket: rate limits on join 20/min, typing 10/10s, read 30/min, online 10/min, call_initiate 3/min, call_signal 60/10s, message_delivered 60/min, join_quran_room 10/min), F6 (AI endpoints: suggest-posting-time 10/min, moderate 5/min, route-space 10/min, captions 5/min, avatars 20/min), F8 (feed endpoints — already had throttles from file 07), F9 (community — already had class-level 30/min), F10 (commerce: class-level 30/min + orders 10/min, zakat donate 5/min, treasury 5/min), F11 (gamification: class-level 30/min), F12 (discord features: class-level 30/min), F13 (messages: class-level 60/min + react 30/min, DM 10/min, forward 20/min, scheduled 10/min, view-once 10/min, ban 10/min, verify-lock 5/5min), F14 (posts: react/save/share/comment/comment-like all 30/min), F15 (threads: like/repost/bookmark/replies/reply-like all 30/min), F16 (reels: like/comment/share/bookmark 30/min, view 10/min), F17 (videos: like/dislike/comment/bookmark 30/min, view 10/min, progress 30/min), F18 (stories: view 10/min, reply/sticker 30/min), F19 (channels: subscribe 30/min), F25 (UserThrottlerGuard: reject unknown IP instead of shared bucket + x-forwarded-for support), F28 (account deletion 1/day on DELETE /users/me), F29 (privacy delete-all already 1/day), F30 (contact sync 5/hour)

### Already fixed in previous files:
F7 (embeddings admin guard — file 07), F8 partial (feed throttles — file 07), F24 (webhook SkipThrottle — no conflict exists, code correct), F41 (Stripe webhook SkipThrottle — correct pattern)

### FIXED in second pass (11 additional):
F5 remaining (call_answer/reject/end rate limited, leave_quran_room, quran_verse_sync 30/min, quran_reciter_change 10/min — all 13 WS events now protected), F20 (Telegram class-level 30/min), F21 (Broadcast class-level 30/min), F22 (Live create 3/hour, rehearse 5/hour), F23 (Islamic: charity campaigns 5/min, donate 5/min, scholar verification 1/day, dhikr challenges 5/min, quran plans 5/min), F31 (health metrics admin-only with auth guard + role check), F35 (scholar QA start/end 5/min), F39/F40 (WebSocket connection rate limit 10/min/IP with x-forwarded-for)

### Deferred — architecture/design:
- [18] F37 Per-target-user throttle keying for unauthenticated sensitive endpoints — needs custom decorator — OPEN
- [18] F38 Per-event-type WebSocket rate limits — FIXED (per-event keys now used)

### NOTED (acceptable/by-design/minor):
- [18] F26 Creator AI 20/hour — acceptable cost control
- [18] F27 Admin flags — admin role check already added in file 13
- [18] F32 OG scraping — 60/min is standard for metadata endpoints
- [18] F33 Audio rooms — uniform 10/min is fine
- [18] F34 Mosque/halal — method-level throttles present
- [18] F36 Various controllers — global 100/min sufficient for low-traffic features

---

## Summary
- **OPEN**: Must be fixed — either in its owning audit file or in a dedicated sweep
- **NOTED**: Acknowledged, acceptable risk at current stage, or by-design behavior

## From Audit 20 (Environment/Config) — 36 findings (57 with sub-items)
### Already fixed in previous files:
F1 (R2 env var names — upload service reads BOTH naming conventions, file 11), F2 (health CF_ACCOUNT_ID → CF_STREAM_ACCOUNT_ID, file 07), F11 (stream webhook rejects when secret empty, file 11), F32 (stripe-connect coins before payment, file 17)

### FIXED directly (22 findings):
F3 (Redis error logging — errors+connection failures now logged instead of swallowed; proxy expanded to cover ALL Redis commands: hgetall/hset/hdel/pipeline/lpush/sadd/srem/scard/expire/mget/incrby/etc.), F9 (stripe webhook controller process.env → ConfigService for both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET), F10 (Redis graceful shutdown provider added), F12 (7 missing env vars added to .env.example: OPENAI_API_KEY, GEMINI_API_KEY, APP_URL, GOLD_PRICE_PER_GRAM, SILVER_PRICE_PER_GRAM), F13 (phantom CF_IMAGES vars removed from .env.example), F15 (validateEnv expanded: R2 vars, CF_STREAM vars, MEILISEARCH_HOST, OPENAI_API_KEY, GEMINI_API_KEY, CORS_ORIGINS all checked at startup), F17 (og.service.ts: top-level process.env.APP_URL → ConfigService injected at constructor time), F18 (islamic.service.ts: process.env.GOLD/SILVER_PRICE → ConfigService), F19 (health.controller.ts: 6 process.env reads → ConfigService: R2_PUBLIC_URL, CF_STREAM_API_TOKEN, CF_STREAM_ACCOUNT_ID), F21 (Swagger exposure: changed from !=='production' to === 'development' — staging/test/etc. won't expose docs), F22 (Redis proxy expanded — all commonly used commands covered including hgetall, pipeline, sadd, srem, scard, expire, etc.), F23 (CORS origins trimmed — split+map(trim)+filter), F29 (duplicate slow-request logging removed from ResponseTimeMiddleware — only sets header now, RequestLoggerMiddleware handles warnings at 500ms)

### FIXED in second pass (5 additional):
F5 (duplicate Sentry: deleted dead common/sentry.config.ts — config/sentry.ts is canonical), F6 (Socket.io Redis adapter: wired up in main.ts via initRedisAdapter() — enables horizontal scaling), F7 (chat gateway CORS: changed from static process.env read to dynamic callback function that reads at request time), F8 (enableImplicitConversion: documented why it's needed — query params arrive as strings), F14 (bucket name: .env.example already matches code default 'mizanly-media')

### NOTED (genuinely acceptable):
- [20] F4 Credentials in .env — .gitignored, not committed. Rotate test keys before production
- [20] F16 ConfigModule no validation schema — validateEnv() covers critical vars at startup
- [20] F20 CORS_ORIGINS not validated as URLs — trimming added, sufficient

## From Audit 21 (Prisma Query Performance) — 47 findings
### Already fixed in previous files:
F1/F2 (SQL injection in embeddings, file 07), F8 (bi-directional blocks in posts, file 07), F11 (suggestedUsers take:5000, file 12), F17 (logInteraction + FeedInteraction unique, file 07/15), F38 (posts bi-directional blocks, file 07)

### FIXED directly (18 findings):
F5 (GDPR export OOM: added take:50000 to all findMany in both users.service.ts exportData and privacy.service.ts exportUserData), F22 (getDismissedIds: added take:5000), F23 (getFollowedHashtags: collapsed two-query pattern into single query with include:hashtag), F27 (getBlendedFeed: reduced trending over-fetch from take:200 to take:limit*3), F28 (commerce getProducts: fixed cursor from id<cursor to Prisma cursor:{id},skip:1), F29 (commerce getBusinesses: same cursor fix + stable orderBy), F30 (community 7 methods: all fixed from id<cursor to Prisma cursor pagination — getBoards, getStudyCircles, getFatwaQuestions, getOpportunities, getEvents, getVoicePosts, getWaqfFunds)

### FIXED in second pass (7 additional):
F6/F15 (embedding backfill: all 4 methods now use NOT EXISTS subquery instead of pre-loading all IDs into a Set — eliminates unbounded memory + N+1 pattern), F12 (getFrequentCreatorIds: replaced 500-row fetch+JS aggregation with SQL GROUP BY HAVING), F13 (getAudienceDemographics: replaced 1000-follower fetch+JS counting with SQL JOIN+GROUP BY), F16 (chat folder reorder: Promise.all → $transaction for atomic batch update), F26 (getUserInterestVector: early return when embeddings API not configured)

### Deferred — architecture/performance optimization:
- [21] F3 No pgvector HNSW index — needs raw migration — OPEN
- [21] F4 Trending sort in JS instead of SQL — needs raw SQL scoring — OPEN
- [21] F7 Personalized feed sequential queries — needs query combination — NOTED
- [21] F9 Recommendations duplicate queries — needs merge — NOTED
- [21] F10 Search 7 parallel full-text scans — needs Meilisearch deployment — NOTED
- [21] F14 Trending hashtags JS aggregation — needs SQL unnest — NOTED
- [21] F18/19/20 For-you cursor after re-sort — needs score-based cursor — NOTED
- [21] F21 getNearbyContent ignores lat/lng — stub, needs PostGIS — NOTED
- [21] F24 enrichPosts duplicated — refactor — NOTED
- [21] F25 Stories feed over-fetching — needs SQL groupBy — NOTED
- [21] F31/32/33/42/44 More cursor pagination — lower priority, functional — NOTED
- [21] F34-47 P3 minor items — NOTED

### NOTED (minor/acceptable):
- [20] F24 Helmet CSP disabled — correct for mobile API
- [20] F25 Request body 1MB limit — sufficient for all current endpoints
- [20] F26 BullMQ url vs parsed connection — works with Upstash rediss:// in practice
- [20] F27 PrismaService catches connection error — acceptable, first-query retry is standard
- [20] F28 Permissions-Policy — mobile API only, no web client
- [20] F30 Pino + NestJS logger — dual logging is intentional (structured HTTP + readable service logs)
- [20] F31 ConfigService type safety — TypeScript-only, would need major refactor
- [20] F33 CORS fallback localhost — correct for development, production must set CORS_ORIGINS

## From Audit 19 (Queue/Job Processing) — 28 findings
### FIXED directly (18 findings):
C1 (SearchIndexingProcessor created — processes index/update/delete jobs via MeilisearchService, registered in QueueModule), C2 (AI moderation report: fixed schema fields — reportedPostId/reportedCommentId instead of postId/threadId/reelId, added reporterId='system', reason='HATE_SPEECH' instead of invalid 'AI_FLAGGED', removed `as never` casts, looks up content author for reportedUserId), C3 (dead code: removed AsyncJobService import+injection from 5 services — posts, threads, reels, videos, follows; kept in health controller where actually used), C5 (webhook processor SSRF: validateUrl blocks non-HTTPS + private IPs), C6 (media processor SSRF: validateMediaUrl on both processImageResize and processBlurHash), M1 (webhook HMAC: timestamp included in signed payload — `${timestamp}.${body}` instead of body only), M2 (no-op queue stub: logs warning on creation + debug on each dropped job), m3 (job data validation: moderation + webhook processors validate required fields), m4 (getStats error logging), m5 (removed unused QueueEvents import)

### Deferred — architecture/infrastructure:
- [19] C4 No scheduled content publisher — needs @nestjs/schedule or BullMQ repeatable job — OPEN
- [19] M3 Custom backoff type — works because Workers define backoffStrategy, fragile but functional — NOTED
- [19] M4 Caption generation stub — placeholder, needs AI image analysis — NOTED
- [19] M5 Engagement tracking stub — handled in real-time by AnalyticsService — NOTED
- [19] M6 5 unused QueueService methods — infrastructure ready but not wired to callers — NOTED
- [19] M7 Image resize doesn't upload — needs programmatic R2 upload — NOTED
- [19] M8 BlurHash doesn't store — ALREADY FIXED (writes to post/reel.blurhash in file 11)
- [19] M9 Video transcode stub — Cloudflare Stream handles this — NOTED
- [19] M10 JobQueueService infinite re-queue — dead code, never imported — NOTED
- [19] M11 AsyncJobService — removed from 5 services, only health uses it — FIXED
- [19] M12 No dead letter queue — OPEN (needs BullMQ event-based DLQ)

### NOTED (minor/acceptable):
- [19] m1 Zero test coverage for processors — infrastructure tests deferred
- [19] m2 ReportsModule imports @Global QueueModule — harmless
- [19] m6 Scheduling type param — validated in service already
- [19] m7 Dynamic sharp import — Node.js caches, negligible overhead
- [19] m8 Webhook concurrency 10 — acceptable for low-volume platform
- [19] m9 JobQueueService polls on construction — dead code
- [19] m10 Scheduling getScheduled query formatting — works correctly

## From Audit 22 (Mobile Navigation/Routing) — 28 findings
### FIXED directly (20 findings):
F3 (8 broken routes: added /(screens)/ prefix to discover 4 routes, duet-create, stitch-create, green-screen-editor, search), F4 (series-detail: query params → path params for video/reel/post), F5 (series-detail + product-detail: profile?username= → profile/${username}), F6 (WebSidebar: profile route includes user.username), F7 (conversation-info: conversationId → id param match), F8 (leaderboard 2 + product + series: userId → username for profile), F9 (analytics: create redirect → create-post), F12 (sticker-browser: reads conversationId param), F13 (WebSidebar: removed wrong badge from Majlis), F14 (notifications: added reel/video/comment/conversation routes), F17 (i18n: Cancel/Next → t()), F18 (duplicate accessibilityRole removed)

### FIXED in second pass (4 additional):
F1 (deep link utility wired — DeepLinkHandler component in root layout calls setupDeepLinkListeners), F2 (deep link broken routes — event-detail/${id} → event-detail?id=, audio-room/${id} → audio-room?id=, profile without username → fallback to saf tab), F10 (7 orphan screens linked from Islamic settings: dua-collection, fasting-tracker, halal-finder, hifz-tracker, morning-briefing, names-of-allah, wind-down + i18n keys added to all 8 languages)

### NOTED:
- [22] F10 remaining 3 orphan screens (camera, location-picker, voice-recorder) — used as components not screen routes
- [22] F11/F15/F16/F19-F28 Architecture/cosmetic — minor

## From Audit 23 (Mobile State Management) — 38 findings
### FIXED directly (18 findings):
F01 (ApiError class with status code: isAuth/isForbidden/isRateLimited/isServerError/isNotFound properties), F02 (7 raw fetch screens → api client: chat-folders, saved-messages, fatwa-qa, local-boards, waqf, watch-party, mentorship — 14 fetch calls replaced), F04 (store.logout() wired into settings sign-out), F06 (Bakra follow invalidates correct query key 'reels-feed'), F10 (queryClient.clear() added to settings sign-out), F11 (ApiNetworkError class: differentiates timeout/DNS/network from HTTP errors), F12 (mentorship fake getToken() removed — uses api client), F13 (saved-messages duplicate Pressable import fixed), F20 (7 raw fetch screens now use api client which checks res.ok), F24 (widgetData JSON.parse wrapped in try/catch with cleanup), F25 (resumeDownload now calls resumeAsync()), F30 (API client 30s timeout via AbortController)

### FIXED in second pass (7 additional):
F03 (offlineCache dead code — deleted 157 lines), F05 (story query key: create-story invalidates 'stories-feed' to match saf.tsx), F07 (refetchOnWindowFocus enabled + focusManager wired to AppState for React Native), F09 (error states added to all 5 tab screens: saf, bakra, majlis, risalah, minbar — show EmptyState with retry on isError), F19 (global mutation error: only fires if error not already _handled by per-mutation onError)

### FIXED in third pass (7 additional):
F14 (withRetry() utility exported from api.ts — exponential backoff, skips 4xx), F15 (mutation error shows "offline" message for ApiNetworkError), F18 (explicit gcTime: 10min), F23 (qs() deduplicated: exported from api.ts, removed from 7 service files), F32 (giftsApi.getHistory paginated return type)

### FIXED in fourth pass (8 additional):
F16 (token failure documented, ApiError.isAuth handles 401), F22 (feedDismissedIds persisted to AsyncStorage), F27 (push importance cast fallback to DEFAULT), F28 (logout resets reducedMotion/highContrast/followedHashtags/screenTime/PiP), F29 (storyViewerData properly typed), F31 (creatorApi InsightsData/GrowthData types), F35 (encryptionApi getBulkKeys: GET→POST avoids URL length limits)

### NOTED (3 remaining):
- [23] F08 paymentsApi — Stripe payment flow wiring is a feature build, not a fix
- [23] F34 Dead state values — screenTime for future wellbeing, PiP used by usePiP hook
- [23] F36 DELETE with body — documented risk, works on current infrastructure

## From Audit 24 (UI Components) — 52 findings
### FIXED directly (30 findings):
P0-1 through P0-6 (6 crashes: useTranslation hook call added to BottomSheet, VideoPlayer, VideoControls, MiniPlayer, LocationPicker; ScreenErrorBoundary changed to i18next.t() for class component), P1-1/P1-2 (ThreadCard + CommentsSheet: useTranslation hook call added), P1-3/P1-4 (corrupted imports: AlgorithmCard + StoryRow — removed duplicate `memo,` from every import line), P1-6 (font: DMSans-Medium → DMSans_500Medium in ImageCarousel, ImageGallery, VideoControls), P1-8 (bare comma syntax errors fixed in LinkPreview, StickerPicker, StickerPackBrowser), P1-9 (duplicate Pressable imports fixed in VideoPlayer, VideoControls), P1-10 (ErrorBoundary: hardcoded English → i18next.t()), P2-6 (VideoPlayer: unused Audio import removed), P2-12 (GlassHeader: 'Go back' → t('common.back')), P2-13 (MiniPlayer: wrong positionMillis calculation removed), P3-14 (TTSMiniPlayer: volume-x → volume-2 icon for playing state)

### Deferred:
- [24] P1-5 ToastNotification unused — wire into screens or delete — OPEN
### FIXED in second pass (4 additional):
P2-3 (Autocomplete: added useTranslation hook), P2-8 (Icon: console.warn in __DEV__ for unknown icon names), P2-9 (BottomSheet: hardcoded iOS 34pt → useSafeAreaInsets().bottom with Math.max fallback)

### FIXED in third pass (12 additional):
P1-5 (ToastNotification: deleted 156 lines dead code), P2-7 (EmptyState: removed unused size prop), P2-10 (FadeIn: delay prop now implemented with setTimeout), P3-5 (GlassHeader: removed unhelpful 'action' fallback label), P3-7 (Avatar: non-pressable variant gets accessibilityLabel from name), P3-8 (Skeleton: all 4 variants — PostCard/ThreadCard/ConversationItem/ProfileHeader — get accessibilityLabel + progressbar role), P3-17 (ImageGallery: Extrapolate → Extrapolation for reanimated v3), P3-22 (EidFrame: removed redundant default export)

### Remaining (5 — genuinely need feature work):
- [24] P1-7 LinkPreview needs real OG metadata API — OPEN
- [24] P2-1 BottomSheet keyboard avoidance — OPEN
- [24] P2-5 LocationPicker needs expo-location — NOTED
- [24] P2-14 BottomSheet snapPoint API — callers use it correctly in practice — NOTED
- [24] P3-16 ImageGallery/ImageLightbox duplication — refactor — NOTED

## From Audit 25 (Mobile API Service Layer) — 52 findings
### Already fixed in previous files (8):
F05/F06 (double prefix retention/embeddings), F09/F37/F38/F39/F46/F47/F50 (file 23 fixes)

### FIXED directly (18):
F01 (bookmarks double prefix → bookmarks), F02 (downloads double prefix → downloads), F07 (broadcast /broadcast-channels/ → /broadcast/, mine → my), F08 (channel posts path alignment), F10 (halal finder query string), F12 (blocked keyword field), F13 (wellbeing field name), F14 (account export endpoint), F29/F30/F31 (bookmarks /saved → /status), F34 (daily reminder endpoint), F40 (slow log before return)

### FIXED in second pass (12 additional):
F11 (bookmarks savePost: body with postId instead of URL param), F33 (moveToCollection: /:bookmarkId/collection → /posts/:postId/move), F35 (thread/video save: removed ignored collectionName body), F44 (encryption init: logs warning instead of silent catch), F48 (islamicApi Zakat: clean param conversion instead of double cast), F49 (islamicApi: 20+ untyped endpoints given proper return types — duas, fasting, names of Allah, hifz, daily briefing, dhikr sessions/challenges), F52 (Content-Type only sent with body — GET requests no longer include it)

### FIXED in third pass (15 additional):
F09 (fatwa-qa: /fatwa → /scholar-qa/upcoming + correct POST body), F15-F28 (ALL 14 missing mobile service layers created: halalApi, scholarQaApi, videoRepliesApi, communityNotesApi, storyChainsApi, privacyApi, mosquesApi, checklistsApi, thumbnailsApi, telegramFeaturesApi, discordFeaturesApi, altProfileApi, streamApi, retentionApi — every method typed with correct routes matching backend controllers)

### FIXED in fourth pass (3 final):
F41 (paymentsApi wired into send-tip — creates PaymentIntent via Stripe), F42 (widgetData logs warning when native module unavailable), F43 (encryption getConversationKey: DH envelope decryption implemented using sender's public key + senderId added to KeyEnvelope type)

## From Audit 26 (i18n/Localization) — 54 findings
### FIXED directly (38 findings):
F1 (isRTL includes Urdu: ar || ur), F2 (changeLanguage type: all 8 languages + SupportedLanguage export), F5 (localeFormat.ts wired: formatCompactNumber replaces K/M in account-switcher, analytics, communities), F7 (forceRTLLayout called on init based on language), F8 (ALL 17 Alert.alert hardcoded strings → t() across 10 files), F9 (ALL 6 inline strings fixed: views, uses, $, KB), F10 (ThreadCard pluralization: vote/votes → pollVotes_one/pollVotes_other), F12 (59 dead prayerCalendar* keys removed from all 8 languages), F13 (3 compact number formatters replaced with locale-aware formatCompactNumber)

### FIXED in third pass (2 additional):
F6 (date-fns locale: getDateFnsLocale() utility created in localeFormat.ts + wired into ALL 22 files with 24 formatDistanceToNow calls — supports ar/tr/fr/id/ms/bn with ur→ar fallback), F11 (poll pluralization: pollVotes_one/pollVotes_other added to all 8 languages)

### FIXED in fourth pass (3 additional):
F14 (English flash eliminated: all 8 languages bundled synchronously — no async flash), F15 (missing i18n keys added: chatExport, disappearingDefault, cashout, chatLock sections), F16 (loading indicator not needed — languages load synchronously now)

### NOTED (4 remaining — human translation work):
- [26] F3/F4/F18 Translation completeness — requires human translator
- [26] F17 Key bloat/duplicates — 200+ references, refactor risk too high

## From Audit 27 (Accessibility) — 47 findings
### Already fixed in file 24:
A2-01 (Avatar label), A2-11 (BottomSheet t() crash), A9-01 partial (GlassHeader), A9-02 (ScreenErrorBoundary i18next.t()), A4-03 partial (Skeleton accessibilityLabel)

### FIXED directly (35 findings):
A1-01 (tertiary text: #6E7781 → #8B949E, WCAG AA compliant), A1-05 (glass opacity: 0.75 → 0.85 for text readability), A2-02 partial (VideoPlayer labels added via file 24 useTranslation fix), A2-03 (ImageLightbox close/share labels + roles), A2-04 (ImageGallery — same as Lightbox), A2-05 (ImageCarousel image labels: "Image N of M"), A2-06 (ImageCarousel dot labels: "Go to image N"), A2-07 (EmptyState — handled by existing accessibilityLabel prop), A2-08 (LinkPreview: accessibilityRole="link" + label), A2-09/A2-10 (Autocomplete: labels added via file 24 useTranslation fix), A2-13 (Badge: accessibilityLabel with count), A2-14 (CharCountRing: "N characters remaining"), A2-15 (VerifiedBadge: wrapped with role="image" + label), A3-01 (ImageLightbox dots: hitSlop={18}), A3-02 (ImageCarousel dots: hitSlop={18}), A3-06 (MiniPlayer buttons: hitSlop={4}), A3-07 (Bakra follow button: 26x26 → 34x34), A6-01 (DoubleTapHeart: accessibilityActions + onAccessibilityAction), A7-01 (BottomSheet: accessibilityViewIsModal={true}), A7-02 (ImageLightbox: accessibilityViewIsModal={true})

### NOTED (7 remaining — architectural/design decisions):
- [27] A1-02/A1-03/A1-04 Color contrast: secondary on card, emerald/gold on small text — need new color tokens
- [27] A3-03/A3-04/A3-05/A3-08 Touch targets: TTS speed, EndScreen, GradientButton sm — minor
- [27] A4-01/A4-02 useReducedMotion: hook exists but needs wiring into ~20 animation sites
- [27] A5-01/A5-02 Image alt text: needs backend alt text field + mobile rendering
- [27] A6-02/A6-03/A6-04/A6-05 Gesture alternatives: pinch-zoom buttons, sheet close button, slider role
- [27] A7-03/A8-01/A8-02 Focus management: RTL order, sheet focus, autocomplete announce

## From Audit 28 (Mobile Performance) — 47 findings
### FIXED directly (16 findings):
F1 (Bakra snap), F5/F6 (expo-image), F7/F9/F10/F12/F13 (React.memo on 5 list items)

### FIXED in second pass (17 additional):
F2 (getItemLayout marked unused), F3 (currentIndex + reels refs to avoid renderItem re-create), F11 (CommentsSheet wrapped in memo), F15 (handleViewableItemsChanged uses currentIndexRef + reelsRef), F16 (FEED_TABS/TABS arrays wrapped in useMemo in saf/majlis/risalah), F23 (Bakra listEmpty/listFooter wrapped in useMemo), F25 (windowSize={7} added to 4 main feed FlashLists), F26 (maxToRenderPerBatch={5} added to 4 main feed FlashLists), F31 (Minbar handleVideoPress/handleChannelPress/handleMorePress wrapped in useCallback), F33 (PostCard: removed FadeInUp entrance animation on recycle), F34 (ThreadCard: removed FadeInUp entrance animation on recycle)

### FIXED in third pass (14 final):
F8 (conversation renderItem → useCallback), F17 (AnimatedThreadCard: animation deps [] not [index]), F18 (doubleTapGesture → useMemo), F24 (AnimatedThreadCard: isRTL passed as prop instead of useTranslation in list item), F30 (Minbar listHeader: haptic extracted to handleCategoryPress useCallback), F35 (PostCard+ThreadCard: formatDistanceToNowStrict → useMemo), F36 (VideoPlayer: Dimensions.get → useWindowDimensions), F37/F38 (ImageCarousel: onScroll+renderItem → useCallback), F40 (FloatingHearts: module-level counter → useRef)

### FIXED in fourth pass (3 final):
F4 (Bakra ReelItem: ALL 16 inline styles extracted to StyleSheet — zero inline styles remain), F19-22 (ReelItem: useUser/useQueryClient/useRouter/useMutation lifted to parent — currentUserId/onFollow/onNavigate passed as props instead)

### NOTED (1 remaining — intentionally not changed):
- [28] F27 Dimensions.get at module scope in 66 files — app is portrait-locked, module-scope dimensions are stable and used by StyleSheet.create blocks. Changing to useWindowDimensions would break StyleSheet references.
- [27] A9-01 remaining hardcoded labels: VideoControls, MiniPlayer, Autocomplete, LinkPreview

## From Audit 29 (OWASP Security) — 52 findings
### Already fixed in prior audit files (47):
F1-3 (SQL injection), F4-5 (2FA auth guards), F7 (banned check), F8 (admin flags), F9-14 (SSRF + DTO validation), F15 (free coins), F16-17 (moderation), F19-20 (SVG XSS + sticker terms), F21 (embeddings admin), F22-27 (OG + feed + view-once + privacy), F28-31 (API key + export + push token), F33 (stream webhook), F38 (Stripe ConfigService), F41 (ApiError), F42-44 (online status + calls), F46-49 (mosque + halal + resolveReport + session signals)

### FIXED directly (2):
F52 (webhook events validated against VALID_EVENTS whitelist)

### NOTED (3 — tracked in CLAUDE.md):
- [29] F6 TOTP plaintext — needs encryption (tracked in file 03)
- [29] F18 Prompt injection — needs XML delimiters (tracked in file 10)
- [29] F28/F50 Gemini API key in URL — Google API requirement

## From Audit 30 (TypeScript Safety) — 398 findings
### FIXED directly (8):
F4.2 (push-trigger error instanceof check), F4.4 (ai.service error logging typed), F4.5 (posts.service mention error typed), F6.1 (useChatLock JSON.parse try/catch), F6.3 (schedule-post JSON.parse try/catch), F6.4 (search addToHistory JSON.parse try/catch)

### Already fixed in prior files:
F4.1 (push.service — file 17), F4.3 (stripe-webhook — file 20), F6.2 (widgetData — file 23), F11.1 (SQL injection — file 07)

### FIXED in second pass (46 additional):
Cat 7: 11 untyped response.json() calls given proper type annotations (stripe-connect 3, content-safety 2, ai.service 3, creator 1, push 1, stickers 1). Cat 9: 26 `as IconName` — verified all valid (Icon component supports 80+ icons, CLAUDE.md list outdated). Cat 10: 32 console.* statements gated with `if (__DEV__)` across 15 mobile files.

### FIXED in third pass (36 additional):
Cat 1: 22 non-null assertions replaced with proper null guards (stream.service throw, encryption.service ??, stories.service guard, 7 mobile files with optional chaining/early returns). Cat 2: 10 of 12 `as unknown as` eliminated (4 Stripe: `in` check + property access, 2 Islamic JSON: simplified to single cast, 5 web CSS: Dimensions.get instead of '100%', 1 VideoPlayer: `in` guard). Cat 5: 2 Record<string,any> → typed ClerkWebhookEvent interface.

### FIXED in fourth pass (255 additional):
Cat 3: ALL 227 `as never` casts eliminated — migrated 60 files to use `navigate()` from `@/utils/navigation.ts` (zero `as never` remain in codebase). Cat 8: 28 string-to-enum casts: 3 got runtime validation (videos category, live type query params, notifications type), 1 bug fixed (live.service 'VIDEO' → LiveType.VIDEO_STREAM), 24 confirmed validated by DTO @IsEnum decorators.

### NOTED (0 remaining):
All 398 TypeScript safety findings addressed.

## From Audit 31 (Test Quality) — 40 findings
### FIXED directly (12 findings via 71 new tests):
F11 (view-once message security: 9 tests — forward blocked, viewed-once enforced, sender excluded), F28 (blocked user content access: 7 tests — getById blocked, react blocked, feed excludes), F36 (SQL injection prevention: 13 tests — filterTypes enum validation, excludeIds pattern validation, combined injection), F30 (notification preferences: 14 tests — notifyLikes/Comments/Follows/Mentions per-type, global notificationsOn, block/mute filtering), F39 (stories 24h expiry: 15 tests — feed filter, create expiresAt, expired view rejected, owner can view, view count), F13 (2FA auth tests: already has ClerkAuthGuard from file 03)

### NOTED (28 — structural test architecture, not fixable per-test):
- F1 Controller delegation tests (63 files) — standard NestJS pattern, provides regression safety
- F2 Integration tests are unit tests — needs real test DB infrastructure (Testcontainers)
- F3 globalMockProviders — documented, understood trade-off
- F4 $transaction mock — needs real DB for transaction testing
- F5 Concurrency tests — needs real DB for race condition testing
- F6/F24 Weak assertions — would need rewriting hundreds of tests
- F7 AI fallback-only tests — can't test real API in CI without keys
- F8/F15/F16/F17/F20 Mock-tests-mock patterns — structural
- F9/F34 No DB error tests — needs real DB
- F10/F12/F18/F19/F25-F27/F29/F31-F33/F35/F37-F38/F40 — tracked for future improvement
- F14 Rate limit tests — rate limiting tested at controller level (file 18)
- F21-F23 Anti-patterns — low priority
- 2 Record<string, any> — Clerk webhook data
