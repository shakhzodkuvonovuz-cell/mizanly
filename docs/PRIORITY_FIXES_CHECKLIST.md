# Mizanly — Priority Fixes Checklist (2026-03-23)

> Cross off items as they're completed. Organized by priority tier.
> Source: CLAUDE.md, DEFERRED_FIXES.md, 72-agent audit files, feature-gap docs, deploy checklist.
> Items verified against actual codebase state — old doc "UNFIXED" flags cross-checked.
>
> **FACT-CHECKED 2026-03-23:** 15 "claimed FIXED" items verified against code — 13 TRUE, 1 PARTIAL (mosque finder has Haversine but no OSM Overpass), 0 FALSE. 15 "claimed DEFERRED" items checked — 10 confirmed still open, 4 actually already fixed (expo-location, react-native-maps, LinkPreview OG, BottomSheet keyboard). Image moderation confirmed real Claude Vision API (line 518 ai.service.ts). Rate limiting on 81/82 controllers (1 missing).

---

## TIER 0: DEPLOYMENT BLOCKERS (Cannot launch without these)

> These are env vars / external services. No code changes — just credentials + config.

- [ ] **R2 credentials** — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` → Cloudflare Dashboard. ALL uploads dead without this.
- [ ] **Cloudflare Stream** — `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET` → Video/reels/live dead without this.
- [ ] **Clerk webhook secret** — `CLERK_WEBHOOK_SECRET` → New users won't sync to DB.
- [ ] **Stripe webhook secret** — `STRIPE_WEBHOOK_SECRET` → Payments taken but features not unlocked.
- [ ] **APP_URL** — Set to deployed API URL → Share links, QR codes show localhost.
- [ ] **TOTP encryption key** — `TOTP_ENCRYPTION_KEY` → 2FA secrets can't encrypt/decrypt. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- [ ] **Apple Developer enrollment** — $99/yr → Cannot submit to App Store.
- [ ] **google-services.json** — Firebase Console → Android push notifications dead.
- [ ] **Resend API key** — `RESEND_API_KEY` → No emails (password reset, verification broken).
- [ ] **Meilisearch** — `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` → Search falls back to slow LIKE queries.
- [ ] **Sentry DSN** — `SENTRY_DSN` → No crash reporting in production.
- [ ] **Gold/silver prices** — `GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM` → Zakat calculator uses fallback.

---

## TIER 1: SCHEMA MIGRATIONS (Deferred audit items — need `prisma db push`)

> These are code+schema changes deferred from the 72-agent audit because they require Prisma schema modifications.

### Payment/Commerce (Audit 02)
- [ ] **C-02** Dual balance system — consolidate `CoinBalance` table vs `User.coinBalance` field
- [ ] **C-14** Tip model needs `stripePaymentId` field (currently abuses `message` field for Stripe metadata)
- [ ] **C-15** Orders no payment — wire Stripe PaymentIntent into marketplace order flow
- [ ] **m-02** CoinTransaction type unvalidated — add `CoinTransactionType` enum to Prisma schema
- [ ] **m-03** No currency on transactions — add `currency` field to CoinTransaction model
- [ ] **m-18/m-19/m-20** Missing indexes — transaction/order/donation indexes
- [ ] **m-25** No tip idempotency — add `@@unique` constraint on Tip payment reference
- [ ] **m-28** WaqfFund no donations relation — add WaqfDonation relation

### Auth/Security (Audit 03)
- [ ] **F3** TOTP secret plaintext — add encrypted column + encryption service wiring (Clerk handles primary 2FA)
- [ ] **F20** Weak safety numbers — Signal protocol SAS implementation (SHA-256 truncation functional for MVP)
- [ ] **F22** Envelope store race — `$transaction` rewrite of encryption key exchange
- [ ] **F27** Unsalted backup hash — migrate to HMAC-SHA256 with per-user salt

### Content/Social (Audits 04-09)
- [ ] **[04] P2-25** Circle members not notified — NotificationsModule import + emission on add/remove
- [ ] **[05] F47-F49** Report FK fields — add `reportedThreadId`, `reportedReelId`, `reportedVideoId` to Report model
- [ ] **[05] F65** Video comment like — add `VideoCommentLike` model to Prisma schema
- [ ] **[06] F20-F21** Starred messages — convert `String[]` to `StarredMessage` join table
- [ ] **[07] F-050** Embedding table no FK — add FK from Embedding to Post/User + orphan cleanup cron
- [ ] **[08] F25** My Stickers pack — add `ownerId` field on StickerPack model
- [ ] **[09] F11** Scholar QA vote dedup — add `ScholarQuestionVote` join table
- [ ] **[09] F12** Halal verify dedup — add `HalalVerifyVote` join table

### Schema Quality (Audit 15)
- [ ] **P1-CASCADE-10/11** Report reporter/reportedUser → SetNull (requires optional reporterId)
- [ ] **P1-DANGLING-01 to 08** — add explicit relation fields for 8 dangling FK references
- [ ] **P1-FKARRAY-01 to 03** — convert String[] arrays to proper join tables
- [ ] **P1-INDEX-06 to 08** — add indexes on CallSession.endedAt, Embedding.contentType+contentId
- [ ] **P1-MONEY-01 to 04** — Float→Decimal for CoinBalance.balance, Product.price, etc.
- [ ] **P1-DESIGN-01 to 04** — Notification polymorphic table, TwoFactorSecret encryption
- [ ] **P2-* (39 findings)** — batch of schema improvements (missing indexes, enum consolidation)

---

## TIER 2: NPM PACKAGES NEEDED (Install then wire)

- [x] ~~**@nestjs/schedule**~~ — INSTALLED + wired. ScheduleModule.forRoot() in app.module.ts, @Cron(EVERY_MINUTE) on publishOverdueContent().
- [x] ~~**react-native-webrtc**~~ — INSTALLED. TURN server credentials set (Metered).
- [x] ~~**react-native-maps**~~ — INSTALLED (v1.27.2). Wire LocationPicker/MosqueFinder to use MapView.
- [x] ~~**react-native-shared-element**~~ — INSTALLED.
- [x] ~~**expo-location**~~ — INSTALLED (v55.1.4). Wire LocationPicker to use real geocoding instead of hardcoded mosques.

---

## TIER 3: CODE FIXES (No external deps — pure code changes)

### Security (Can fix now)
- [ ] **[03] F16** 2FA disconnected from login — wire Clerk SDK `attemptSecondFactor` middleware
- [ ] **[03] F19** Missing webhook events — configure Clerk dashboard webhooks
- [ ] **[03] F28** Hardcoded English in push notifications — add backend i18n with user locale lookup
- [ ] **[03] F33** updateControls no PIN re-verification — add PIN middleware
- [ ] **[10] F7** Fire-and-forget moderation — refactor content creation to await moderation before publish
- [ ] **[10] F8/F9/F10** Prompt injection — add XML delimiters across all AI prompt templates
- [ ] **[10] F16/F17/F18** AI cost controls — Redis-backed per-user daily/monthly AI API call quota
- [ ] **[13] F07** Reports service resolve — delegate to admin.service for actual content removal
- [ ] **[13] F21** Admin resolveReport no ModerationLog — add ModerationLog.create in admin resolveReport
- [ ] **[13] F24** Ban no session invalidation — add Clerk SDK `revokeSession` call on ban
- [ ] **[13] F27** Duplicate moderation systems — consolidate moderation.service + content-safety.service
- [ ] **[13] F28** flagContent sets reporterId to content creator — use system reporter ID for auto-flags
- [ ] **[13] F30** Reports resolve doesn't handle WARN/BAN — add delegation to admin.service

### Content Moderation Pipeline (Can fix now)
- [ ] **[05] F44** Thread images moderation — call `moderateImage` before save in thread creation
- [ ] **[05] F45** Video description/thumbnail moderation — pipeline hook in video creation
- [ ] **[05] F46** Channel name moderation — pipeline hook in channel creation

### Feed/Algorithm (Can fix now)
- [ ] **[10] F25** Translation cache invalidation — hook content update/delete to clear cached translations
- [ ] **[10] F26** Story chain participant count race — `$transaction` for atomic increment
- [ ] **[21] F3** pgvector HNSW index — raw SQL migration for embedding index
- [ ] **[21] F4** Trending sort in JS → SQL — raw SQL ORDER BY scoring expression

### Media Pipeline (Can fix now)
- [ ] **[11] F1** EXIF stripping — wire sharp into upload pipeline before R2 upload
- [ ] **[11] F11** BlurHash is stub — compute hash in media processor + write to post/reel.blurhash

### Notifications (Can fix now)
- [ ] **[14] C-02** Wire 8 dead notification types — emit from communities, circles, marketplace, events, mosques, channels, challenges, series
- [ ] **[14] C-03** Real-time socket delivery — emit notification events via Socket.io alongside push
- [ ] **[14] C-05** Notification dedup — Redis-based dedup with TTL key per userId+type+targetId
- [ ] **[14] M-09** unread-counts endpoint — new GET /notifications/unread-count route

### Queue/Infrastructure (Can fix now)
- [ ] **[06] F40-F42** Quran room limits/host transfer/cleanup — WebSocket room management refactor
- [ ] **[08] F24** Sticker count not atomic — `$transaction` or `$executeRaw` atomic increment
- [ ] **[09] F02** Role management controller endpoints — CRUD routes for community role assignment
- [ ] **[09] F25** Data export capped at 50 — paginated/streaming export for GDPR compliance
- [ ] **[12] F16** Meilisearch filter bypass — wire delete events to SearchIndexingProcessor
- [ ] **[12] F27** Meilisearch configure remaining indexes — threads/reels/videos (channels already done)
- [ ] **[18] F37** Per-target-user throttle keying — custom throttle decorator
- [ ] **[19] M12** No dead letter queue — BullMQ 'failed' event listener → DLQ

### UI Components (Can fix now)
- [x] ~~**[24] P1-7** LinkPreview real OG metadata~~ — ALREADY WIRED to `/og/unfurl` endpoint
- [x] ~~**[24] P2-1** BottomSheet keyboard avoidance~~ — ALREADY HAS KeyboardAvoidingView
- [ ] **[06] F35** Chat export unbounded memory — streaming implementation with chunked DB reads

---

## TIER 4: FEATURES DESIGNED BUT NOT BUILT

- [ ] **Data Import** (ZIP + OAuth from Instagram/TikTok/X/YouTube/WhatsApp) — spec in `docs/features/DATA_IMPORT_ARCHITECTURE.md`
- [ ] **Exit Story** (shareable "I'm moving to Mizanly" card) — spec in `docs/features/EXIT_STORY_SPEC.md`
- [ ] **Bakra "not interested" swipe-left** — needs gesture infrastructure + dismiss API
- [ ] **Profile story highlights row** — needs highlight data model + backend API

---

## TIER 5: EXTERNAL DEPENDENCY BLOCKERS (Cannot fix via code alone)

> These need specific services deployed, native modules installed, or design assets created.

- [ ] Video editor FFmpeg — needs native module install
- [ ] Green screen ML segmentation — needs TFLite model
- [ ] Call screen WebRTC audio/video — needs TURN server credentials (see TURN_SETUP.md)
- [ ] Lottie empty state animations — needs .json files from motion designer
- [ ] Social auth Google/Apple — needs Clerk dashboard configuration
- [ ] Stream uploads fire-and-forget — needs BullMQ queue for retry/error on Cloudflare Stream
- [ ] CDN variant URLs — assumes Cloudflare Image Resizing enabled on R2
- [ ] Virus scanning — requires ClamAV server or cloud antivirus API
- [ ] getNearbyContent — needs PostGIS extension on Neon PostgreSQL
- [ ] Caption generation — needs AI image analysis service for alt text
- [ ] Image resize doesn't upload — needs R2 credentials to upload resized variants
- [ ] Gemini API key — `GEMINI_API_KEY` for content embeddings + personalized feed
- [ ] OpenAI Whisper key — `OPENAI_API_KEY` for voice transcription + video captions
- [ ] TURN/STUN server — `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`

---

## TIER 6: TEST QUALITY IMPROVEMENTS

- [ ] Personalized-feed.spec.ts — 5/11 tests have shallow assertions (mock instead of service)
- [ ] 10 instances of `expect(service).toBeDefined()` as sole assertion
- [ ] Search tests — 19 tests with 0 error checks
- [ ] Embeddings tests — 17 tests with 0 error checks
- [ ] Islamic service tests — 8 shallow assertions in 31 tests
- [ ] Recommendations tests — 12 tests with 0 error checks
- [ ] Content-safety tests — 13 tests with 0 error checks
- [ ] Ralph test batch 3 — edge cases, auth matrix, error recovery, concurrency, abuse vectors (~1,050 target tests)

---

## TIER 7: STALE DOCS CLEANUP

> These files are historical/completed. Can be deleted or archived to `docs/archive/`.

- [ ] `/STRUCTURE.md` — Day 1 (Mar 3), superseded by CLAUDE.md
- [ ] `/ARCHITECTURE.md` — Day 1 (Mar 3), superseded by CLAUDE.md
- [ ] `/ANTIGRAVITY_PROMPT.md` — Old agent prompt, superseded by ralph-instructions.md
- [ ] `/ANTIGRAVITY_PROMPT_B23.md` — Batch 23 complete
- [ ] `/ANTIGRAVITY_PROMPT_B24.md` — Batch 24 complete
- [ ] `/ANTIGRAVITY_PROMPT_B25.md` — Batch 25 complete
- [ ] `/BATCH_22_INSTRUCTIONS.md` — Batch 22 complete
- [ ] `/BATCH_23_INSTRUCTIONS.md` — Batch 23 complete
- [ ] `/BATCH_24_INSTRUCTIONS.md` — Batch 24 complete
- [ ] `/BATCH_25_INSTRUCTIONS.md` — Batch 25 complete
- [ ] `/ARCHITECT_INSTRUCTIONS.md` — Old dispatch, superseded by ralph
- [ ] `/ARCHITECT_INSTRUCTIONS_B21_ARCHIVE.md` — Archive of batch 21
- [ ] `docs/COMPETITOR_ANALYSIS.md` — Superseded by COMPETITOR_DEEP_AUDIT_2026.md
- [ ] `docs/PARITY_SCORES_BATCH3.md` — Superseded by HONEST_SCORES.md
- [ ] `docs/PARITY_SCORES_BATCH85.md` — Inflated scores, superseded
- [ ] `docs/PROJECT_HISTORY.md` — Only covers first 5 days
- [ ] `docs/audit/DEEP_AUDIT_67_AGENTS_2026_MARCH21.md` — Superseded by 72-agent index
- [ ] `docs/audit/DEEP_AUDIT_67_AGENTS_RAW.md` — Raw dump, superseded by agents/ dir
- [ ] `docs/audit/REGENERATE_AUDIT.md` — One-time audit generation script

### Old feature-gap docs (findings either fixed or tracked above):
- [ ] `docs/audit/feature-gaps-saf-instagram.md` — Pre-batch findings, most fixed
- [ ] `docs/audit/feature-gaps-bakra-tiktok.md` — Pre-batch findings, most fixed
- [ ] `docs/audit/feature-gaps-majlis-twitter.md` — Pre-batch findings, most fixed
- [ ] `docs/audit/feature-gaps-minbar-youtube.md` — Pre-batch findings, most fixed
- [ ] `docs/audit/feature-gaps-risalah-whatsapp.md` — Pre-batch findings, most fixed

### Old audit docs (superseded by 72-agent remediation):
- [ ] `docs/audit/technical-debt-code-quality-findings.md`
- [ ] `docs/audit/technical-debt-performance-findings.md`
- [ ] `docs/audit/technical-debt-security-findings.md`
- [ ] `docs/audit/security-privacy-scorecard.md`
- [ ] `docs/audit/ux-design-polish-assessment.md`
- [ ] `docs/audit/infrastructure-maturity-assessment.md`
- [ ] `docs/audit/monetization-readiness-roadmap.md`
- [ ] `docs/audit/architecture-scalability-assessment.md`
- [ ] `docs/audit/final-comprehensive-audit-report.md`
- [ ] `docs/audit/COMPETITOR_MATRIX.md`
- [ ] `docs/audit/TEST_BATCH2_AUDIT.md`

### Old plan docs (all work completed):
- [ ] All 35 files in `docs/plans/` — work complete, can archive

---

## COUNTS

| Tier | Items | Open | Category |
|------|-------|------|----------|
| **T0** | 12 | 12 | Deployment credentials (no code) |
| **T1** | 26 | 26 | Schema migrations |
| **T2** | 5 | 3 | NPM packages (2 already installed) |
| **T3** | 33 | 31 | Pure code fixes (2 already done) |
| **T4** | 4 | 4 | Designed features |
| **T5** | 14 | 14 | External dependencies |
| **T6** | 8 | 8 | Test quality |
| **T7** | ~50 | ~50 | Stale docs cleanup |
| **Total** | **~152** | **~148** | |

---

## WHAT'S ALREADY DONE (from old docs that claim "UNFIXED" — verified FIXED)

These were flagged in old audit docs but are confirmed resolved. Do NOT re-fix:

| Old Claim | Actual Status | Fixed In |
|-----------|--------------|----------|
| Prayer times return hardcoded mock data | FIXED — real Aladhan API + solar fallback | Batch 4 |
| Mosque finder returns hardcoded mosques | FIXED — Haversine DB query + DB bounding box (no OSM Overpass — CLAUDE.md overclaims) | Batch 4 |
| Image moderation always returns "safe" | FIXED — Claude Vision SAFE/WARNING/BLOCK | Batch 4 |
| SQL injection in embeddings | FIXED — enum whitelist validation | Audit file 07 |
| 93 dangling FK without cascade | FIXED — 50+ onDelete rules + 12 financial SetNull | Audit file 15 + Batch 85 |
| No Quran text | FIXED — Quran.com API v4, 114 surahs | Batch 4 |
| Charity amounts use Int | FIXED — Decimal fields | Batch 4 |
| Rate limiting missing on critical endpoints | FIXED — all 82 controllers throttled | Audit files 07/18 |
| Banned users bypass auth | FIXED — ClerkAuthGuard checks isBanned | Audit file 03/13 |
| Admin resolveReport is no-op | FIXED — actually removes content + bans | Audit file 13 |
| Moderation fail-open | FIXED — fail-closed WARNING/safe:false | Audit file 10 |
