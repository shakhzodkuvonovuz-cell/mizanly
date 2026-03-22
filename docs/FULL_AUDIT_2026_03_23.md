# Mizanly — Complete 29-Dimension Audit (2026-03-23)

> Every finding from every dimension. Nothing omitted. Sorted by severity within each section.
> Total: 29 dimensions audited, ~380 findings documented.

---

## SESSION ACHIEVEMENTS (before audit)

- [x] 189 → 0 TypeScript compilation errors fixed (38 files)
- [x] 4,277 tests passing (0 failures)
- [x] 33/35 env vars configured (only Meilisearch missing)
- [x] All NPM packages installed (@nestjs/schedule, react-native-webrtc, react-native-shared-element)
- [x] @nestjs/schedule wired with @Cron(EVERY_MINUTE) for scheduled post auto-publishing
- [x] Env var naming standardized (CLOUDFLARE_* → R2_*)
- [x] 40 broken tests fixed after type corrections

---

## DIMENSION 1: TYPESCRIPT COMPILATION (Backend)

**Score: 10/10** — 189 errors fixed to 0.

### Fixed (no remaining issues)
- [x] 18 null-unsafe `.user` accesses in og.service.ts
- [x] 12 wrong model/field names in privacy.service.ts (bookmark→savedPost, searchHistory→watchHistory, muterId→userId)
- [x] 11 null-unsafe + non-existent field errors in posts.service.ts (editedAt removed, userId null guards)
- [x] 10 null-unsafe story grouping in stories.service.ts
- [x] 8 null-unsafe + non-existent field errors in threads.service.ts (editedAt removed)
- [x] 6 null-unsafe errors in videos.service.ts
- [x] 6 null-unsafe + wrong field errors in reels.service.ts (editedAt→updatedAt)
- [x] 5 null-unsafe errors in feed-transparency.service.ts
- [x] 4 scheduling.service.ts type narrowing
- [x] 3 stickers.service.ts non-existent fields
- [x] 3 recommendations.service.ts null userId
- [x] 3 ai-tasks.processor.ts null→undefined conversion
- [x] 3 personalized-feed.service.ts null→undefined conversion
- [x] 2 enrich.ts wrong VideoReaction field (reaction→isLike)
- [x] 2 events.service.ts (communityId→community: { connect })
- [x] 2 channels.service.ts (isActive removed, null userId guard)
- [x] 2 circles.service.ts (createdAt→joinedAt, composite cursor)
- [x] 2 hashtags.service.ts (removed include: { hashtag }, manual join)
- [x] 2 monetization.service.ts (null filter on tip senderIds)
- [x] 2 polls.service.ts (expiresAt→endsAt)
- [x] 1 admin.service.ts (isMuted→warningsCount increment)
- [x] 1 auth.service.ts (pushToken→device model)
- [x] 1 chat-export.service.ts (null sender fallback)
- [x] 1 live.service.ts (removed follow.status check)
- [x] 1 notifications.service.ts (settings→userSettings)
- [x] 1 push.service.ts (ExpoPushTicket type cast)
- [x] 1 playlists.service.ts (channel.userId nullable)
- [x] 1 payments/stripe-webhook.controller.ts (Dispute type)
- [x] 1 parental-controls.controller.ts (DTO destructuring)
- [x] 1 search-indexing.processor.ts (missing type field)
- [x] 1 socket-io-adapter.ts (dynamic import for missing module)
- [x] 1 users.service.ts (bookmark→savedPost+threadBookmark+videoBookmark)
- [x] 1 stream.service.ts (FAILED→DRAFT status)
- [x] 1 reports.service.ts (isMuted→warningsCount)
- [x] 5 unexported interfaces (CallSessionWithParticipants, FeedItem, DuaEntry, NameOfAllah, MeilisearchDocument)

---

## DIMENSION 2: TEST SUITE

**Score: 10/10** — 276 suites, 4,277 tests, 0 failures.

### No remaining issues.

---

## DIMENSION 3: MOBILE TYPE SAFETY

**Score: 10/10**

- [x] 0 `@ts-ignore` in app code
- [x] 0 `@ts-expect-error` in app code
- [x] 0 `as any` in app code (1 match is a comment, not code)

---

## DIMENSION 4: SECURITY

**Score: 7.5/10**

### HIGH (2)
- [ ] **SEC-H1** Unbounded query `take: 50000` in users.service.ts exportAccountData() — 10 entity types × 50K = memory exhaustion. Cap to 10,000.
- [ ] **SEC-H2** Unbounded query `take: 50000` in privacy.service.ts exportUserData() — notifications. Cap to 10,000.

### MEDIUM (3)
- [ ] **SEC-M1** Silent `.catch(() => {})` in admin.service.ts lines 138, 141, 144, 162, 175, 192 — content removal silently fails. Add `this.logger.error()`.
- [ ] **SEC-M2** Moderation service `getQueue()`, `review()`, `getStats()` don't verify adminId is actually admin — rely on controller guard only. Add `verifyAdmin()` check.
- [ ] **SEC-M3** Redis cache invalidation `.catch(() => {})` in posts.service.ts line 644 — feed cache stays stale on Redis failure. Add logging.

### LOW (2)
- [ ] **SEC-L1** embeddings.service.ts uses `$queryRawUnsafe` with string concatenation — MITIGATED by enum validation + regex checks. Safe but could refactor to `$queryRaw`.
- [ ] **SEC-L2** Gemini API key in URL query parameter (Google API requirement, not a code defect). Documented.

### PASSING (verified secure)
- [x] 0 SQL injection exploitable
- [x] 0 hardcoded secrets in source code
- [x] 0 `eval()` or `Function()` usage
- [x] 0 path traversal vulnerabilities
- [x] 0 SSRF exploitable (R2 domain + private IP blocklist)
- [x] 75/75 controllers have auth guards (5 public routes verified legitimate: webhooks, legal, OG, stream)
- [x] Webhook HMAC-SHA256 signed + timestamp replay protection
- [x] 96% of findMany calls have `take` limits

### SILENT CATCH PATTERNS (79 total — should log instead of swallow)
- [ ] **SEC-CATCH** 79 instances of `.catch(() => {})` across services. Replace with `.catch(err => this.logger.warn(...))`.

---

## DIMENSION 5: SCHEMA QUALITY

**Score: 8/10**

### Enum Candidates (41 String fields that should be enums)
- [ ] **SCH-E1** Order.status — pending|paid|shipped|delivered|cancelled|refunded
- [ ] **SCH-E2** Product.status — active|sold_out|draft|removed
- [ ] **SCH-E3** ZakatFund.status — active|completed|closed
- [ ] **SCH-E4** CommunityTreasury.status — active|completed|closed
- [ ] **SCH-E5** PremiumSubscription.status — active|cancelled|expired
- [ ] **SCH-E6** PremiumSubscription.plan — monthly|yearly
- [ ] **SCH-E7** Product.category — food|clothing|books|art|electronics|services|other
- [ ] **SCH-E8** HalalBusiness.category — restaurant|grocery|services|education|mosque|other
- [ ] **SCH-E9** ZakatFund.category — individual|mosque|school|disaster|orphan|other
- [ ] **SCH-E10** VolunteerOpportunity.category — disaster_relief|mosque|education|food_bank|cleanup|other
- [ ] **SCH-E11** Challenge.category — quran|dhikr|photography|fitness|cooking|learning
- [ ] **SCH-E12** FatwaQuestion.topic — new_muslim|quran|arabic|fiqh|general
- [ ] **SCH-E13** ScholarQuestion.topic — quran|hadith|fiqh|seerah|arabic|tafsir
- [ ] **SCH-E14** OfflineDownload.quality — auto|360p|720p|1080p
- [ ] **SCH-E15** EndScreen.type — subscribe|watch_next|playlist|link
- [ ] **SCH-E16** ThumbnailVariant.contentType — post|reel|video
- [ ] **SCH-E17** Embedding.contentType — (already EmbeddingContentType enum — OK)
- [ ] **SCH-E18** ProfileCustomization.layoutStyle — default|grid|magazine|minimal
- [ ] **SCH-E19** ProfileCustomization.bioFont — default|serif|mono|arabic
- [ ] **SCH-E20** DailyTaskCompletion.taskType — dhikr|quran|reflection
- [ ] **SCH-E21** AiAvatar.style — default|anime|watercolor|islamic_art
- [ ] **SCH-E22** UserStreak.streakType — posting|engagement|quran|dhikr|learning
- [ ] **SCH-E23** FatwaQuestion.madhab — hanafi|maliki|shafii|hanbali|any
- [ ] **SCH-E24** IslamicEvent.eventType — eid_prayer|iftar|lecture|quran_competition|fundraiser|social|other
- [ ] **SCH-E25** UserReputation.tier — newcomer|member|trusted|guardian|elder
- [ ] **SCH-E26** BlockedKeyword.filterType — include|exclude
- [ ] **SCH-E27** AdminLog.action — member_added|member_removed|member_banned|title_changed|etc
- [ ] **SCH-E28** CreatorEarning.type — cashout|tip|gift|subscription
- [ ] **SCH-E29** LiveParticipant.role — viewer|host|speaker|moderator
- [ ] **SCH-E30-41** (12 more minor enum candidates across CoinTransaction, Waqf, etc.)

### Missing Constraints
- [ ] **SCH-U1** MessageReaction needs `@@unique([userId, messageId])` or composite PK — allows duplicate reactions

### GPS Precision
- [ ] **SCH-F1** Float lat/lng on HalalBusiness, HalalRestaurant, MosqueCommunity — should be `Decimal(10,8)` for sub-meter accuracy (8 fields total)

### Schema Migrations Deferred (from DEFERRED_FIXES.md — 26 items)
- [ ] **SCH-D1** Dual balance system — consolidate CoinBalance vs User.coinBalance
- [ ] **SCH-D2** Tip.stripePaymentId field missing
- [ ] **SCH-D3** Orders no Stripe PaymentIntent integration
- [ ] **SCH-D4** CoinTransactionType enum missing
- [ ] **SCH-D5** CoinTransaction.currency field missing
- [ ] **SCH-D6** Transaction/order/donation indexes missing
- [ ] **SCH-D7** Tip idempotency @@unique missing
- [ ] **SCH-D8** WaqfFund.donations relation missing
- [ ] **SCH-D9** TOTP secret plaintext (needs encrypted column)
- [ ] **SCH-D10** Safety numbers weak (SHA-256 truncation, needs Signal SAS)
- [ ] **SCH-D11** Envelope store race condition ($transaction needed)
- [ ] **SCH-D12** Backup hash unsalted (needs HMAC-SHA256 + per-user salt)
- [ ] **SCH-D13** Circle members not notified on add/remove
- [ ] **SCH-D14** Report FK fields missing (reportedThreadId, reportedReelId, reportedVideoId)
- [ ] **SCH-D15** VideoCommentLike model missing
- [ ] **SCH-D16** StarredMessage join table missing (currently String[])
- [ ] **SCH-D17** Embedding FK to Post/User missing
- [ ] **SCH-D18** StickerPack.ownerId field missing
- [ ] **SCH-D19** ScholarQuestionVote join table missing
- [ ] **SCH-D20** HalalVerifyVote join table missing
- [ ] **SCH-D21** Report reporter/reportedUser SetNull (optional reporterId)
- [ ] **SCH-D22** 8 dangling FK references need explicit relation fields
- [ ] **SCH-D23** String[] arrays → proper join tables (3 models)
- [ ] **SCH-D24** CallSession.endedAt + Embedding indexes missing
- [ ] **SCH-D25** CoinBalance.balance, Product.price Float→Decimal
- [ ] **SCH-D26** Notification polymorphic table + TwoFactorSecret encryption

### Passing
- [x] All 188 models in active use (0 dead models)
- [x] All relations have explicit onDelete rules
- [x] All currency fields use Decimal(12,2)
- [x] 293 indexes/unique constraints defined
- [x] All 5 public controllers verified legitimate

---

## DIMENSION 6: TEST COVERAGE GAPS

**Score: 6/10**

### CRITICAL — Untested Critical Path
- [ ] **TST-C1** ClerkAuthGuard — 0 tests. Handles every authenticated request. Needs 8+ tests (valid token, invalid token, banned, expired ban, deactivated, deleted, missing user, token extraction).
- [ ] **TST-C2** MeilisearchService — 0 tests. Search infrastructure. Needs 10+ tests.
- [ ] **TST-C3** EmailService — 0 tests. HTML escaping (XSS prevention), send success/failure, missing key fallback. Needs 8+ tests.
- [ ] **TST-C4** OptionalClerkAuthGuard — 0 tests. Public+personalized routes. Needs 6+ tests.

### HIGH — Untested Infrastructure
- [ ] **TST-H1** SecurityHeadersMiddleware — 0 tests. HSTS, CSP, X-Frame-Options headers not verified.
- [ ] **TST-H2** AnalyticsProcessor — 0 tests.
- [ ] **TST-H3** MediaProcessor — 0 tests. Image resizing, R2 upload.
- [ ] **TST-H4** NotificationProcessor — 0 tests. Push delivery, user preferences.
- [ ] **TST-H5** SanitizePipe — 0 tests. Input validation.

### MEDIUM — Untested Common Code
- [ ] **TST-M1** CurrentUser decorator — 0 tests
- [ ] **TST-M2** cache.ts utility — 0 tests
- [ ] **TST-M3** enrich.ts utility — 0 tests
- [ ] **TST-M4** image.ts utility — 0 tests
- [ ] **TST-M5** sanitize.ts utility — 0 tests
- [ ] **TST-M6** AnalyticsService — 0 tests
- [ ] **TST-M7** AsyncJobsService — 0 tests
- [ ] **TST-M8** FeatureFlagsService — 0 tests
- [ ] **TST-M9** CorrelationIdMiddleware — 0 tests
- [ ] **TST-M10** RequestLoggerMiddleware — 0 tests
- [ ] **TST-M11** ResponseTimeMiddleware — 0 tests

### LOW — Weak Tests (anti-patterns)
- [ ] **TST-L1** RetentionController — only 1 test case (needs 8+)
- [ ] **TST-L2** live.service.enum.spec.ts — 75% toBeDefined()-only assertions
- [ ] **TST-L3** videos.service.enum.spec.ts — 75% toBeDefined()-only assertions
- [ ] **TST-L4** 296+ `toBeDefined()` assertions across codebase — ~29.5% of tests assert existence, not correctness

---

## DIMENSION 7: MODULE INTERCONNECTIVITY

**Score: 10/10**

- [x] 0 missing module imports
- [x] 0 circular dependencies
- [x] 0 unresolvable service injections
- [x] 0 missing module exports
- [x] 0 orphaned controllers
- [x] All 79 modules registered in app.module.ts
- [x] PrismaModule, RedisModule, QueueModule all @Global()
- [x] ChatGateway properly provided in MessagesModule

---

## DIMENSION 8: BUTTON FUNCTIONALITY

**Score: 10/10**

- [x] All 6 tab bar buttons wired
- [x] All 7 create sheet options navigate to correct screens
- [x] PostCard: like, comment, share, bookmark, double-tap heart — all call APIs
- [x] Bakra reels: like, comment, share, follow, duet, stitch, bookmark — all wired
- [x] Profile: follow/unfollow, message, edit — all wired
- [x] Settings: all 20+ sections navigate correctly, sign out works
- [x] 0 dead buttons (`onPress={() => {}}`)
- [x] 0 missing navigation routes
- [x] 2 intentional stubs: "Polls coming soon" toast, disabled account management rows

---

## DIMENSION 9: MOBILE-BACKEND API ALIGNMENT

**Score: 7/10**

### CRITICAL (2)
- [ ] **API-C1** Gamification endpoints — `@Controller()` has EMPTY path prefix. Mobile calls `/streaks`, `/xp`, `/achievements`, etc. May resolve to wrong routes. Verify routing works.
- [ ] **API-C2** Missing endpoint `POST /posts/{id}/share-as-story` — mobile calls it, backend doesn't implement it.

### MEDIUM (5 controllers with empty @Controller())
- [ ] **API-M1** gamification.controller.ts — empty prefix
- [ ] **API-M2** commerce.controller.ts — empty prefix
- [ ] **API-M3** community.controller.ts — empty prefix
- [ ] **API-M4** discord-features.controller.ts — empty prefix
- [ ] **API-M5** telegram-features.controller.ts — empty prefix

### Passing
- [x] 196+ endpoints verified aligned
- [x] Auth token setup correct (Bearer header)
- [x] 30-second request timeout configured
- [x] Proper error typing (ApiError, ApiNetworkError)
- [x] No hardcoded production URLs
- [x] Environment-backed API URL

---

## DIMENSION 10: i18n COMPLETENESS

**Score: 4/10**

### CRITICAL — Languages at <20% translation
- [ ] **I18N-C1** Urdu (ur) — 2,712 of 3,179 keys untranslated (15% complete)
- [ ] **I18N-C2** Bengali (bn) — 2,729 of 3,173 keys untranslated (14% complete)
- [ ] **I18N-C3** French (fr) — 2,685 of 3,173 keys untranslated (15% complete)
- [ ] **I18N-C4** Indonesian (id) — 2,678 of 3,173 keys untranslated (16% complete)
- [ ] **I18N-C5** Malay (ms) — 2,681 of 3,173 keys untranslated (15% complete)

### MEDIUM — Partially translated
- [ ] **I18N-M1** Arabic (ar) — 728 of 3,179 keys untranslated (77% complete)
- [ ] **I18N-M2** Turkish (tr) — 362 of 3,179 keys untranslated (89% complete)

### LOW — Extra keys
- [ ] **I18N-L1** ar.json and tr.json have 6 extra keys not in en.json (mosque.duaCollection, mosque.fastingTracker, mosque.halalFinder, mosque.hifzTracker, mosque.morningBriefing, mosque.namesOfAllah)

### Passing
- [x] 0 hardcoded English strings in screens (all use t() calls)
- [x] 3,173 English keys as source of truth

---

## DIMENSION 11: ACCESSIBILITY

**Score: 7/10**

### MEDIUM — Missing accessibility labels
- [ ] **A11Y-M1** 47 screens missing `accessibilityLabel` on interactive elements (23% of 209 screens). Screens: 2fa-setup, 2fa-verify, account-switcher, ai-assistant, ai-avatar, appeal-moderation, caption-editor, chat-folders, create-event, dhikr-challenge-detail, duet-create, hajj-companion, islamic-calendar, location-picker, and 33 more.

### LOW — Small touch targets
- [ ] **A11Y-L1** 53 elements with width/height 40px (below 44px WCAG minimum) — mostly icons with hitSlop
- [ ] **A11Y-L2** 50 elements at 32px — small icons
- [ ] **A11Y-L3** 49 elements at 36px — icons
- [ ] **A11Y-L4** 40 elements at 28px — indicators
- [ ] **A11Y-L5** 30 elements at 20px — badges (non-interactive, acceptable)

### Passing
- [x] 640/834 interactive elements have accessibilityLabel (76.7%)
- [x] Buttons are 44px+ (WCAG AA compliant)
- [x] 140 elements have hitSlop expansion for touch targets

---

## DIMENSION 12: RTL SUPPORT

**Score: 6/10**

### MEDIUM — Manual RTL instead of native
- [ ] **RTL-M1** ~202 instances of `marginLeft`/`marginRight`/`paddingLeft`/`paddingRight` that should be `marginStart`/`marginEnd`/`paddingStart`/`paddingEnd`
- [ ] **RTL-M2** ~314 CSS `left:`/`right:` properties that should be `start:`/`end:`
- [ ] **RTL-M3** Only 16 instances of manual `isRTL && { textAlign: 'right' }` — functional but brittle

### Passing
- [x] RTL detection works (isRTL includes Arabic + Urdu)
- [x] forceRTLLayout called on init
- [x] Date-fns locale wired for all 8 languages

---

## DIMENSION 13: MOBILE COMPONENT ADOPTION

**Score: 6/10**

### MAJOR — RefreshControl violation
- [ ] **CMP-M1** 47 raw `<RefreshControl>` instances across app/ — 0% BrandedRefreshControl adoption. Violates CLAUDE.md rule 18. Files: achievements, blocked, blocked-keywords, archive, charity-campaign, challenges, channel/[handle] (2x), circles, creator-dashboard, creator-storefront, cross-post, discover, end-screen-editor, followed-topics, gift-shop, link-child-account, mutual-followers, notifications, marketplace, muted, membership-tiers, photo-music, post-insights, parental-controls, hashtag/[tag], profile-customization, product-detail, product/[id], post/[id], revenue, restricted, saved (4x), screen-time, profile/[username], scholar-verification, send-tip, series-discover, series/[id], series-detail, story-viewer, streaks, video/[id], watch-history, xp-history.

### MEDIUM — Hardcoded colors
- [ ] **CMP-M2** 60+ hardcoded hex colors in app/ screens. ~40% intentional palettes (chat-wallpaper, create-story), ~30% gradient accents, ~20% white/overlay, ~10% should use tc.* theme tokens.

### MEDIUM — Raw Image usage
- [ ] **CMP-M3** 8 raw `<Image>` instances in 6 files (92% ProgressiveImage adoption). Should convert: charity-campaign, collab-requests (2x), creator-storefront, discover. Acceptable: 2fa-setup (QR), create-story (temp preview), appeal-moderation (evidence).

### MEDIUM — Alert.alert for feedback
- [ ] **CMP-M4** 10-15 of 76 `Alert.alert` calls are non-destructive feedback that should use `showToast()`. Remaining ~60 are legitimate destructive confirmations (delete, block, sign out).

### LOW — Console output ungated
- [ ] **CMP-L1** 7 files with ungated console statements: BottomSheet.tsx (console.warn), api.ts (console.warn), encryption.ts (console.debug), performance.ts (console.warn), registerServiceWorker.ts (console.warn), sentry.ts (console.error + console.log). All non-critical.

---

## DIMENSION 14: PERFORMANCE (Backend)

**Score: 7/10**

### CRITICAL — Unbounded queries
- [ ] **PERF-C1** feed.service.ts line 96 — `take: 5000` on feed dismissals per request
- [ ] **PERF-C2** posts.service.ts lines 107-110 — 4 parallel `take: 5000` for blocks/mutes per feed request
- [ ] **PERF-C3** feed.service.ts lines 173-190 — duplicate `take: 5000` block/mute queries in following feed
- [ ] **PERF-C4** users.service.ts lines 129-150 — `take: 50000` × 11 entity types in GDPR export

### MEDIUM — Inefficient pagination
- [ ] **PERF-M1** feed.service.ts lines 210-290 — trending feed: offset pagination + in-app scoring (refetches all 100 rows per page)
- [ ] **PERF-M2** posts.service.ts lines 137-168 — "for you" feed: same offset + re-score pattern

### MEDIUM — Heavy relation loads
- [ ] **PERF-M3** live.service.ts lines 82-86 — list queries include full host object (5 fields per session)
- [ ] **PERF-M4** notifications.service.ts lines 42-45 — includes 4 optional relations (post, reel, thread, video) regardless of notification type

### LOW — Connection pool pressure
- [ ] **PERF-L1** admin.service.ts lines 210-216 — 6 parallel count queries (acceptable for admin)
- [ ] **PERF-L2** creator.service.ts lines 92-130 — 5 parallel aggregates including SQL raw
- [ ] **PERF-L3** creator.service.ts lines 267-312 — 4 groupBy + SQL + findMany (could timeout without index on contentCreatorId)

---

## DIMENSION 15: PERFORMANCE (Mobile)

**Score: 8/10**

### LOW — FlatList missing keyExtractor
- [ ] **MPERF-L1** risalah.tsx FlatList — no explicit `keyExtractor` prop (uses default index, risky if list reorders)

### Passing
- [x] Good useCallback discipline throughout
- [x] No inline `style={{}}` objects in FlatList renderItems
- [x] FlashList used for heavy lists (Bakra reels)
- [x] No N+1 patterns on client side

---

## DIMENSION 16: DEPLOYMENT READINESS

**Score: 5/10**

### CRITICAL
- [x] ~~DEP-C1~~ FALSE FINDING — .env is in .gitignore and never committed to git history. Verified via git ls-files.
- [ ] **DEP-C2** Icon/splash images corrupted — 69 bytes each (1x1 pixel). App build will crash. Need proper 1024x1024 icon + splash assets.
- [ ] **DEP-C3** google-services.json missing — Android push notifications will fail at build time.
- [ ] **DEP-C4** CORS hardcoded to `localhost:8081,localhost:8082` — production API will reject all non-localhost requests.
- [ ] **DEP-C5** railway.json sets `NODE_ENV=development` in installCommand — production optimizations disabled.

### HIGH
- [ ] **DEP-H1** 18 HIGH severity npm vulnerabilities — socket.io-parser (DoS), tar (path traversal), multer (resource cleanup DoS), glob (command injection), fast-xml-parser (XXE).
- [ ] **DEP-H2** APP_URL and API_URL set to `http://localhost:3000` — share links, QR codes, OG metadata all show localhost.

### MEDIUM
- [ ] **DEP-M1** Meilisearch not configured — search uses 7 parallel Prisma LIKE queries (2-5s latency).
- [ ] **DEP-M2** railway.json has no healthcheckPath — Railway won't detect app crashes.
- [ ] **DEP-M3** docker-compose.yml has hardcoded dev password `mizanly_dev` — risk if accidentally deployed.

### Passing
- [x] Health check endpoints exist (/health/live, /health/ready, /health/metrics)
- [x] Privacy policy endpoint exists (16 GDPR sections)
- [x] Terms of service endpoint exists (15 sections, DMCA/CCPA)
- [x] Database validation at startup (DATABASE_URL + CLERK_SECRET_KEY checked)
- [x] 15 env vars logged as warnings if missing
- [x] Swagger disabled in production
- [x] Helmet security headers enabled
- [x] gzip compression enabled
- [x] Socket.io Clerk JWT auth on connect

---

## DIMENSION 17: APP CONFIGURATION

**Score: 8/10**

### Passing
- [x] Bundle ID: `app.mizanly.mobile`
- [x] App name: `Mizanly`
- [x] Version: `0.1.0`
- [x] Deep link scheme: `mizanly://`
- [x] Permissions: camera, microphone, location, audio declared
- [x] Fonts: expo-font plugin enabled
- [x] Notifications: expo-notifications with color #0A7B4F
- [x] EAS Project ID configured
- [x] Router origin: `https://mizanly.app`

### Needs fixing (covered in DEP-C2)
- [ ] **APP-1** Icon and splash images corrupted (69 bytes each)

---

## DIMENSION 18: PACKAGE HEALTH

**Score: 6/10**

### HIGH — Vulnerabilities
- [ ] **PKG-H1** socket.io-parser — unbounded binary attachment DoS
- [ ] **PKG-H2** tar — arbitrary file creation via symlink/hardlink
- [ ] **PKG-H3** multer — DoS via incomplete resource cleanup
- [ ] **PKG-H4** glob — command injection via -c/--cmd flag
- [ ] **PKG-H5** fast-xml-parser — XXE entity expansion bypass
- [ ] **PKG-H6-H18** 13 more HIGH severity vulnerabilities in transitive deps

### Passing
- [x] NestJS 10.4 (current)
- [x] Prisma 6.3 (current)
- [x] Stripe 20.4 (current)
- [x] React Native 0.76 (current)
- [x] Expo 52 (current)

---

## DIMENSION 19: DEEP LINKING

**Score: 10/10**

- [x] Custom scheme: `mizanly://`
- [x] Universal links: `https://mizanly.com` + `https://mizanly.app`
- [x] 13 screen types supported (post, profile, conversation, live, event, prayer-times, audio-room, thread, reel, video, notifications, settings, search, hashtag)
- [x] Cold-start + background handling via DeepLinkHandler component
- [x] iOS associatedDomains + Android intent filters configured

---

## DIMENSION 20: ERROR BOUNDARIES

**Score: 10/10**

- [x] 196/196 screens have ScreenErrorBoundary (667 occurrences)
- [x] 1 global ErrorBoundary at root layout
- [x] ScreenErrorBoundary uses i18next.t() directly (avoids hooks-in-class crash)
- [x] "Try again" + "Go Home" escape buttons

---

## DIMENSION 21: OFFLINE HANDLING

**Score: 10/10**

- [x] useNetworkStatus hook with NetInfo
- [x] Global OfflineBanner (FadeInDown/FadeOutUp animation, retry button)
- [x] Zustand `isOffline` state accessible on all screens
- [x] Offline queue: 8 action types, AsyncStorage persistence, 24h TTL, flush on reconnect
- [x] Feed cache: 6 predefined keys, stale-while-revalidate, offline-first

---

## DIMENSION 22: RETRY LOGIC

**Score: 9/10**

- [x] React Query: 3 retries with exponential backoff (1s → 2s → 4s → max 30s)
- [x] refetchOnWindowFocus enabled
- [x] Network-aware mutation retry (skips 4xx)
- [x] Global mutation error shows toast
- [x] staleTime: 5 min, gcTime: 10 min

---

## DIMENSION 23: WEBSOCKET (Mobile)

**Score: 10/10**

### ~~CRITICAL~~ — FALSE FINDING (verified 2026-03-23)
- [x] ~~**WS-C1**~~ **FALSE FINDING** — socket.io-client IS fully integrated across 4 screens:
  - `risalah.tsx` — real-time conversation list updates
  - `conversation/[id].tsx` — full real-time messaging (send, receive, typing, delivery receipts)
  - `call/[id].tsx` — WebRTC signaling (initiate, answer, reject, end, ICE candidates)
  - `quran-room.tsx` — real-time Quran study (verse sync, reciter changes, participants)
- [x] Connects to `/chat` namespace with Clerk JWT auth token
- [x] Uses `transports: ['websocket']` (no polling fallback)
- [x] SOCKET_URL correctly strips `/api/v1` from API URL and appends `/chat`
- [x] Events match backend: join_conversation, send_message, typing, read, call_*, quran_*

The explore agent only searched `/src/` directory and missed `/app/` where screens live.

---

## DIMENSION 24: LOADING STATES

**Score: 10/10**

- [x] 666 Skeleton component occurrences (branded emerald shimmer)
- [x] 507 isLoading/isPending/isError state checks
- [x] 10 ActivityIndicator uses (all in buttons, none for content loading)
- [x] 0 bare ActivityIndicator violations

---

## DIMENSION 25: EMPTY STATES

**Score: 10/10**

- [x] 395 EmptyState component uses
- [x] 0 raw "No items" text violations
- [x] Staggered entrance animation + pulsing CTA

---

## DIMENSION 26: PULL-TO-REFRESH

**Score: 9/10**

- [x] 207 BrandedRefreshControl occurrences
- [x] 141 screens with functional refresh logic
- [x] 0 fake setTimeout refresh
- [x] All connected to real data fetches

### Note: Dimension 13 found 47 raw RefreshControl — these may overlap with BrandedRefreshControl count. Cross-verify. The 47 count may be inflated: some files import both RefreshControl and BrandedRefreshControl (e.g., BrandedRefreshControl wraps RefreshControl internally, or files where the import exists but inline usage was already swapped). Grep matches on the import line, not just JSX usage.

---

## DIMENSION 27: CACHE PERSISTENCE

**Score: 9/10**

- [x] feedCache.ts with AsyncStorage backend
- [x] 6 predefined cache keys (SAF_FEED, BAKRA_FEED, MAJLIS_FEED, CONVERSATIONS, USER_PROFILE, PRAYER_TIMES)
- [x] Stale-while-revalidate pattern
- [x] Error-tolerant (no throws on cache failures)
- [x] 30-minute default TTL

---

## DIMENSION 28: LEGAL/GDPR

**Score: 9/10**

- [x] Privacy policy endpoint: 16 GDPR-compliant sections
- [x] Terms of service endpoint: 15 sections, DMCA/CCPA covered
- [x] Data export endpoint exists (users.service.ts exportAccountData)
- [x] Account deletion endpoint exists (30-day grace period)

### LOW
- [ ] **LEGAL-L1** Data export unbounded (take:50000) — GDPR allows paginated export but current implementation could OOM (covered in SEC-H1)

---

## DIMENSION 29: GIT HEALTH

**Score: 8/10**

### CRITICAL
- [x] ~~GIT-C1~~ FALSE FINDING — .env not in git. .gitignore covers it.

### MEDIUM
- [ ] **GIT-M1** 12 stale root-level markdown files should be deleted or archived: STRUCTURE.md, ARCHITECTURE.md, ANTIGRAVITY_PROMPT*.md (3), BATCH_*_INSTRUCTIONS.md (4), ARCHITECT_INSTRUCTIONS*.md (2)
- [ ] **GIT-M2** 35 completed plan docs in docs/plans/ should be archived
- [ ] **GIT-M3** ~15 superseded audit docs should be archived

---

## SUMMARY BY SEVERITY

| Severity | Count | Examples |
|----------|-------|---------|
| **CRITICAL** | 12 | socket.io not integrated, 5 languages untranslated, corrupted icons, CORS localhost |
| **HIGH** | 25 | npm vulns (18), unbounded queries (4), deployment config (3) |
| **MEDIUM** | 67 | Enum candidates (41), silent catches, test gaps, component adoption, accessibility |
| **LOW** | 52 | Touch targets, console.log, RTL properties, GPS precision, extra i18n keys |
| **PASSING** | 222 | Module wiring, buttons, deep linking, error boundaries, offline, loading, empty states |
| **TOTAL** | ~378 | |

---

## TOP 10 PRIORITIES (Action Order)

| # | ID | Fix | Effort |
|---|-----|-----|--------|
| 1 | WS-C1 | Integrate socket.io-client on mobile for real-time chat | 4-8 hours |
| 2 | DEP-C2 + APP-1 | Create proper icon + splash assets | 1 hour |
| 3 | DEP-C4 | Fix CORS for production domains | 5 min |
| 4 | DEP-C5 | Fix railway.json NODE_ENV | 5 min |
| 5 | PKG-H1-H18 | npm audit fix (18 HIGH vulns) | 30 min |
| 6 | PERF-C1-C4 | Cap unbounded queries take:5000→take:100 | 30 min |
| 7 | TST-C1-C4 | Write tests for ClerkAuthGuard, Meilisearch, Email, OptionalGuard | 4 hours |
| 8 | SEC-CATCH | Replace 79 silent .catch(()=>{}) with logging | 2 hours |
| 9 | CMP-M1 | Replace 47 raw RefreshControl with BrandedRefreshControl | 2 hours |
