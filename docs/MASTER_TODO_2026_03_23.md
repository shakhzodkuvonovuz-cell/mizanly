# MASTER TODO — Every Single Finding (Updated 2026-03-23 Session 2)

> Consolidated from: 291 gaps audit, 80 DEFERRED_FIXES, 29-dimension audit, deploy checklist,
> algorithm audit, UI/UX deep audit (March 19 + March 22), comprehensive audit (60-dim),
> honest scores, test quality audit, competitor deep audit, priority fixes checklist,
> session continuation prompt, and gaps verification doc.
> NOTHING omitted. If it needs work, it's here.

---

## CRITICAL — App Store / Launch Blockers (12)

- [ ] Apple IAP package not installed (App Store will reject coin purchases via Stripe)
- [ ] App icon 69-byte placeholder (build will crash)
- [ ] App splash 69-byte placeholder (build will crash)
- [ ] Apple Developer $99/yr enrollment
- [ ] WebRTC not wired (react-native-webrtc installed, RTCPeerConnection only in call/[id].tsx but no getUserMedia, no ICE exchange)
- [ ] Clerk still uses TEST keys (sk_test_, pk_test_) — need production instance
- [ ] Stripe still uses TEST keys — need live keys
- [ ] APP_URL still localhost:3000 — share links/QR codes broken
- [ ] No custom domain configured (api.mizanly.app, mizanly.app)
- [ ] No DNS configured
- [ ] Social auth Google/Apple — disabled "Coming Soon" buttons in sign-in/sign-up (needs Clerk dashboard config)
- [ ] 18 HIGH severity npm vulnerabilities — socket.io-parser (DoS), tar (path traversal), multer (DoS), glob (cmd injection), fast-xml-parser (XXE)

---

## HIGH — Broken/Dead-End Features (24)

- [x] duet-create: 0 upload refs — FIXED (Wave 1 — video picker added)
- [x] stitch-create: 0 upload refs — FIXED (Wave 1 — video picker added)
- [x] zakat-calculator: 0 API calls — FIXED (Wave 4 — wired to islamicApi for live prices)
- [x] islamic-calendar: 0 API calls — FIXED (Wave 4 — wired to eventsApi)
- [x] ogApi.ts missing on mobile — FIXED (Wave 4 — ogApi.ts created)
- [ ] altProfileApi.ts exists but 0 screens import it — flipside feature dead on mobile
- [ ] communityNotesApi.ts exists but 0 screens import it — community notes dead on mobile
- [ ] Payments mostly unused — only send-tip.tsx uses paymentsApi. donate/gift-shop/waqf have TODO stubs
- [x] Chat lock PIN visible — N/A (no TextInput exists, uses biometric)
- [x] DM from non-followers unrestricted — FIXED (Wave 4 — private accounts block non-follower DMs)
- [x] No file size limit on image upload — FIXED (Wave 4 — 20MB image, 100MB reel, 500MB video)
- [x] No banned user screen — FIXED (Wave 4 — banned.tsx created)
- [x] story-viewer.tsx useHaptic() — FIXED (Wave 1)
- [x] live/[id].tsx Math.random() — FIXED (Wave 1)
- [x] FloatingHearts.tsx Math.random() — FIXED (Wave 1)
- [ ] Video editor export is simulated — FFmpeg not installed, shows "Export Simulated" alert
- [ ] Green screen has no background segmentation — TFLite not installed
- [ ] Call screen is a complete facade — no real audio/video transmission
- [ ] Notification tones play no audio — preview button does nothing
- [ ] Chat theme picker doesn't persist — Apply calls router.back() without saving
- [ ] Cashout shows "Coming Soon" — entire monetization pipeline non-functional
- [ ] Community Posts media sends local file:// URIs — other users see broken images
- [ ] Bookmark Folders create/delete are no-ops — functions exist but do nothing
- [ ] Audio room 3 dead buttons — Reactions, Decline Hand, End Room have no onPress handler

---

## HIGH — Rule Violations & Code Bugs (15)

- [x] BottomSheet no Android BackHandler — FIXED (Wave 1)
- [x] PostCard no long-press context menu — FIXED (Wave 1)
- [x] ScreenErrorBoundary Sentry — REMOVED (was wrong — already reports via captureException)
- [x] Quran Reading Plan `plan` variable ReferenceError — already fixed
- [x] Audio Library Rules of Hooks — already fixed
- [x] Sticker Browser SCREEN_WIDTH — already uses useWindowDimensions
- [x] Chat View JSX nesting error — FIXED (Wave 1)
- [x] LinkPreview Math.random() — already fixed
- [x] "System" theme broken — FIXED (Wave 2)
- [x] Light mode systematically broken — PARTIALLY FIXED (Wave 2 — EmptyState, elevation, _layout tc bugs)
- [x] StatusBar breaks light mode — already fixed
- [x] conversation/[id].tsx Math.random() — FIXED (Wave 1)
- [x] Waqf duplicate Alert import — already fixed
- [x] SEC-M1: Silent catches in admin.service.ts — already fixed
- [x] SEC-M2: Moderation verifyAdmin — already fixed

---

## MEDIUM — UI/UX Quality Issues (74)

### Components & Design System
- [ ] BlurHash NOT in PostCard — 0 blurhash refs. Images pop in without placeholder
- [ ] No reaction picker on posts (only like/unlike, no LOVE/HAHA/WOW)
- [ ] No story quick-reactions (emoji row at bottom of story viewer)
- [ ] No emoji picker component
- [x] @mention not highlighted in RichText — already fixed
- [ ] No bidi text handling in RichText (Arabic in English post renders wrong)
- [ ] Link preview not used in PostCard (component exists, not imported)
- [ ] No double-tap like on Saf posts (only works on reels)
- [ ] Tab bar haptic missing
- [x] Avatar fontWeight hardcoded — FIXED (Wave 2)
- [x] GradientButton loading layout shift — FIXED (Wave 2)
- [ ] EmptyState paddingTop:80 hardcoded — should be responsive/spacing token
- [x] Skeleton shimmer direction LTR — already fixed
- [ ] No shimmer stagger wave — all skeleton elements animate simultaneously
- [ ] Typing indicator text-only ("typing...") — should be animated dots like WhatsApp
- [ ] No voice message waveform visualization in chat bubbles
- [ ] BottomSheet setTimeout race condition — setTimeout(onClose, 250) races with unmount
- [ ] ImageLightbox/ImageGallery 85% duplicated — 600+ lines near-identical code
- [ ] LocationPicker is 100% mock — hardcoded locations, fake API delay
- [x] Marketplace star rating uses heart icons — FIXED (Wave 2)
- [x] Marketplace price $ hardcoded — FIXED (Wave 2 — formatCurrency)
- [x] Emoji used as structural icons — already fixed (uses Icon)
- [x] Social auth brand icons — N/A (text labels only, no icons)

### Screens & Navigation
- [x] Follower count not refreshed after follow/unfollow — FIXED (Wave 3 — optimistic update)
- [ ] Feed doesn't remember scroll position (resets on tab switch)
- [ ] No grid/list view toggle on profile
- [ ] No "Edited" label on edited posts
- [ ] No repost attribution (reposted by who?)
- [ ] No unfollow confirmation dialog
- [ ] No force update check (old app versions run forever)
- [ ] No maintenance mode screen (server down → raw errors)
- [ ] No app rating prompt (expo-store-review not installed)
- [ ] Old username links break (no redirect)
- [ ] Missing keyboard dismiss on auth screens (tap outside)
- [ ] Missing autoComplete="one-time-code" on sign-up verification
- [ ] Missing "Resend code" on sign-up verification screen
- [ ] Inconsistent progress indicators in onboarding (bar vs dots)
- [ ] Static Dimensions.get('window') in bakra — won't update on rotation/split view
- [ ] Chat folders have no filter rules — empty named containers
- [ ] New conversation has no contact list — empty screen with search box
- [ ] Playlist can't be played — no Play All, Shuffle, reorder, or remove
- [ ] Watch Party non-functional — requires typing raw video IDs, no sync
- [ ] No seller analytics in creator dashboard
- [ ] No payout history in cashout screen
- [ ] No follower growth chart in analytics
- [ ] Account Settings dead link — storage-management screen doesn't exist
- [ ] Data export shares raw JSON — violates App Store data portability requirements
- [ ] Status privacy stored in AsyncStorage only — resets on app reinstall

### Video Player
- [x] VideoPlayer no SafeArea — FIXED (Wave 2)
- [ ] VideoPlayer no orientation lock on fullscreen
- [x] VideoPlayer no StatusBar hide — FIXED (Wave 2)
- [x] Video player no gestures — already has double-tap seek
- [x] Mini player shows no video — FIXED (Wave 2)

### Chat & Messaging
- [ ] No group invite link
- [ ] No read receipt toggle in settings
- [ ] Can't share reel to DM
- [x] Images in chat not tappable — FIXED (Wave 3 — ImageLightbox)
- [x] URLs in messages not linkified — FIXED (Wave 3 — RichText)
- [ ] No mention autocomplete in post comments

### Islamic Features
- [ ] No Arabic font on Quran/Hadith screens — 5 screens missing fontFamily: fonts.arabic
- [ ] Mosque Finder no map — "Map view coming soon" placeholder
- [ ] Zero audio on any Islamic screen — no Quran recitation, Adhan, Dhikr beads, Dua audio
- [x] Prayer location hardcoded — already dynamic
- [x] Qibla direction hardcoded — already calculated
- [ ] Qibla compass static — no magnetometer integration, arrow doesn't rotate with device

### Backend/API
- [ ] Scheduled posts no timezone handling
- [ ] No trending feed cache (query runs every request)
- [ ] No device fingerprinting (1000 accounts per phone)
- [ ] No screenshot prevention on 2FA/encryption screens
- [ ] SEC-M3: Redis cache invalidation catch in posts.service.ts line 644

### External Services
- [ ] R2 CORS not configured on bucket
- [ ] R2 lifecycle rules not set (temp uploads pile up)
- [ ] Sentry source maps not configured for EAS builds
- [ ] Resend domain not verified (emails may go to spam)

---

## MEDIUM — Accessibility (5)

- [ ] 47 screens missing accessibilityLabel on interactive elements (23% of 209 screens)
- [ ] accessibilityRole missing on 126/199 files (37%)
- [ ] accessibilityHint on ~30 files only (should be all complex actions)
- [ ] accessibilityState on ~10 files only (should be all toggles/checkboxes)
- [ ] Small touch targets: 53 elements at 40px, 50 at 32px (below WCAG 44px minimum)

---

## MEDIUM — RTL Support (3)

- [ ] ~202 instances of marginLeft/marginRight should be marginStart/marginEnd
- [ ] ~314 CSS left:/right: properties should be start:/end:
- [x] Skeleton shimmer direction not RTL-aware — already fixed

---

## MEDIUM — Performance (8)

- [x] GDPR export take:10000 — FIXED (Wave 2 — reduced to 5000)
- [ ] Trending feed: offset pagination + in-app scoring (refetches all rows per page)
- [ ] "For you" feed: same offset + re-score pattern
- [ ] live.service.ts list queries include full host object (heavy relation loads)
- [ ] notifications.service.ts includes 4 optional relations regardless of notification type
- [ ] No pgvector HNSW index on embeddings (needs raw SQL migration)
- [ ] Trending sort in JS instead of SQL (needs raw SQL ORDER BY scoring)
- [x] risalah.tsx keyExtractor — already has

---

## MEDIUM — Hardcoded Strings / i18n Gaps (3)

- [x] ~50+ hardcoded English strings — FIXED (Wave 2 — search 28 keys, edit-profile 1 key, thread/[id] 4 keys; minbar/achievements/marketplace/discover already use t())
- [ ] ar.json and tr.json have 6 extra keys not in en.json
- [x] FlashList estimatedItemSize — already has on all FlashLists

---

## MEDIUM — Stale Docs to Clean Up (3)

- [x] 12 stale root-level markdown files — already deleted
- [x] 35 completed plan docs in docs/plans/ — already deleted
- [x] ~15 superseded audit docs — already deleted
- [x] DEPLOY_CHECKLIST.md wrong webhook URLs — FIXED (Wave 1)
- [x] DEPLOY_CHECKLIST.md wrong model count — FIXED (Wave 1)
- [x] DEPLOY_CHECKLIST.md health path — FIXED (Wave 1)

---

## ALGORITHM — Feed/Recommendation Issues (7)

- [ ] Interest vector averages into noise (diverse users get bad recs)
- [ ] No exploration mechanism (new content with 0 views never surfaces)
- [ ] Scoring weights hardcoded (no A/B testing)
- [ ] Session signals in-memory only (resets on restart, won't scale)
- [ ] Islamic boost uses hardcoded prayer hours (not location-aware)
- [ ] Diversity reranking too naive (only same-author prevention)
- [ ] Trending window 48 hours (popular-get-more-popular loop)

---

## SCHEMA — Deferred Migrations (27)

- [ ] C-02: Dual balance system (CoinBalance table + User.coinBalance coexist)
- [x] C-14: Tip stripePaymentId — FIXED (Wave 4)
- [ ] C-15: Orders no Stripe PaymentIntent integration
- [ ] m-02: CoinTransactionType enum missing
- [ ] m-03: CoinTransaction currency field missing
- [ ] m-18/19/20: Transaction/order/donation indexes missing
- [x] m-25: Tip @@unique — FIXED (Wave 3)
- [x] m-28: WaqfDonation model — FIXED (Wave 4)
- [ ] F3: TOTP secret stored plaintext (needs encrypted column)
- [ ] F20: Safety numbers weak (SHA-256 truncation)
- [ ] F22: Envelope store race condition
- [ ] F27: Backup hash unsalted
- [x] F47-49: Report FK fields — FIXED (Wave 4)
- [x] F65: VideoCommentLike model — FIXED (Wave 3)
- [ ] F20-21: StarredMessage needs join table (currently String[])
- [x] F-050: Embedding postId/userId — FIXED (Wave 4)
- [x] F25: StickerPack ownerId — FIXED (Wave 3)
- [x] F11: ScholarQuestionVote — FIXED (Wave 3)
- [x] F12: HalalVerifyVote — FIXED (Wave 3)
- [ ] P1-CASCADE-10/11: Report reporter/reportedUser SetNull
- [ ] P1-DANGLING-01-08: 8 dangling FK references
- [ ] P1-FKARRAY-01-03: String[] arrays to join tables
- [x] P1-INDEX-06-08: Missing indexes — FIXED (Wave 3 — CallSession, Embedding, Order)
- [ ] P1-MONEY-01-04: Float to Decimal remaining fields (CoinBalance.balance, Product.price)
- [ ] P1-DESIGN-01-04: Notification polymorphic table, TwoFactorSecret encryption
- [ ] P2-001: Mixed cuid/uuid ID strategy (94 cuid + 61 uuid)
- [ ] P2-003: 41 String fields should be enums (Order.status, Product.status, etc.)

---

## CODE FIXES — Still Deferred from 72-Agent Audit (31)

### Security & Auth
- [ ] [03] F16: 2FA disconnected from login flow (needs Clerk attemptSecondFactor middleware)
- [ ] [03] F28: Hardcoded English in push notifications (needs backend i18n with user locale)
- [ ] [03] F33: updateControls no PIN re-verification
- [ ] [13] F24: Ban doesn't invalidate Clerk session (needs Clerk revokeSession call)

### Content Moderation Pipeline
- [x] [05] F44: Thread moderation before save — FIXED (Wave 3)
- [x] [05] F45: Video moderation before save — FIXED (Wave 3)
- [x] [05] F46: Channel moderation before save — FIXED (Wave 3)
- [ ] [10] F7: Fire-and-forget moderation — content publishes before moderation completes
- [ ] [10] F8/9/10: Prompt injection — need XML delimiters across all AI prompt templates
- [ ] [10] F16/17/18: AI cost controls — no per-user daily/monthly AI API call quota
- [x] [10] F25: Translation cache invalidation — FIXED (Wave 4)
- [ ] [10] F26: Story chain participant count race condition ($transaction needed)
- [ ] [13] F07: Reports service resolve — doesn't delegate content removal to admin.service
- [ ] [13] F18: autoRemoveContent ignores comments
- [ ] [13] F21: Admin resolveReport creates no ModerationLog
- [ ] [13] F27: Duplicate moderation systems (moderation.service + content-safety.service)
- [ ] [13] F28: flagContent sets reporterId to content creator (should use system ID)
- [ ] [13] F30: Reports resolve doesn't handle WARN/BAN actions

### Notifications
- [x] [04] P2-25: Circle members notified — FIXED (Wave 4 — CIRCLE_INVITE emission)
- [x] [14] C-02: Wire dead notification types — FIXED (Wave 4 — 8 emissions in 5 modules)
- [ ] [14] C-03: Real-time socket notification delivery (emit via Socket.io alongside push)
- [x] [14] C-05: Notification dedup — FIXED (Wave 3)
- [ ] [14] C-08: Expo access token for push service auth
- [x] [14] M-07: Notification cleanup cron — FIXED (Wave 4)
- [x] [14] M-09: unread-counts endpoint — FIXED (Wave 3)

### Infrastructure
- [x] [06] F19: Scheduled message auto-send — FIXED (Wave 4)
- [ ] [06] F35: Chat export unbounded memory (needs streaming with chunked DB reads)
- [x] [06] F40-42: Quran room management — FIXED (Wave 4)
- [ ] [08] F10: Challenge accepts absolute progress (needs server-side tracking)
- [x] [08] F24: Sticker count atomic — FIXED (Wave 4)
- [ ] [12] F16: Meilisearch filter bypass (deleted content stays indexed)
- [ ] [19] M12: No dead letter queue for BullMQ

---

## INSTALLED BUT NOT WIRED (6)

- [ ] react-native-shared-element — installed, no SharedElement in screens
- [ ] react-native-maps — installed, MosqueFinder doesn't use MapView
- [ ] Lottie — no .json animation files, no LottieView
- [ ] Green screen ML segmentation — needs TFLite model
- [ ] LocationPicker — expo-location installed but uses hardcoded mosques
- [ ] expo-location — installed but not wired to geocoding/reverse geocoding

---

## TESTS — Incomplete (10)

- [ ] Ralph test batch 3 (~1,050 planned tests never executed)
- [x] personalized-feed.spec shallow — FIXED (Wave 3 — 21->42 tests)
- [x] content-safety.spec if-typeof — FIXED (Wave 3 — 14->36 tests)
- [x] recommendations.spec 0 error paths — FIXED (Wave 3 — 15->29 tests)
- [ ] 10 instances of `expect(service).toBeDefined()` as sole assertion across specs
- [ ] 8 instances of `expect(string.length).toBeGreaterThan(0)` (tests constants, not logic)
- [ ] 4 files with conditional `if typeof` test guards that hide regressions
- [ ] 296+ `toBeDefined()` assertions across codebase (~29.5% of tests test existence not correctness)
- [ ] Search tests — 19 tests with 0 error checks
- [ ] Embeddings tests — 17 tests with 0 error checks

---

## TRANSLATIONS — Human Required (7)

- [ ] Urdu (ur): 14% translated
- [ ] Bengali (bn): 14% translated
- [ ] French (fr): 15% translated
- [ ] Indonesian (id): 16% translated
- [ ] Malay (ms): 15% translated
- [ ] Arabic (ar): 77% translated
- [ ] Turkish (tr): 89% translated

---

## INFRASTRUCTURE — NOT BUILT (8)

- [ ] No landing page (mizanly.com)
- [ ] No analytics/attribution
- [ ] No A/B testing framework
- [ ] No admin dashboard web UI
- [ ] No moderation dashboard web UI
- [ ] No widget support (iOS/Android home screen)
- [ ] Metro bundler version conflict (need metro@0.83.5 at root)
- [ ] No CI/CD pipeline for mobile builds (EAS Build not automated)

---

## LARGE FILE DECOMPOSITION (4)

- [ ] conversation/[id].tsx — 93KB, entire messaging UI in one component
- [ ] create-story.tsx — 58KB, canvas + text effects + music selection
- [ ] video/[id].tsx — 50KB, full video player + controls + comments
- [ ] search.tsx — 40KB+, deeply nested conditionals for 7 tab types

---

## COMPETITOR FEATURES — Post-Launch (140 items)

Not listed individually here — see GAPS_COMPLETE_VERIFIED_2026_03_23.md sections G, S-WW for the full list including AR filters, map search, shopping checkout, AI chat, collaborative playlists, business profiles, etc.

---

## COUNTS

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Critical (launch blockers) | 12 | 0 | 12 |
| High (broken features) | 24 | 12 | 12 |
| High (rule violations/bugs) | 15 | 15 | 0 |
| Medium (UI/UX quality) | 74 | 17 | 57 |
| Medium (accessibility) | 5 | 0 | 5 |
| Medium (RTL) | 3 | 1 | 2 |
| Medium (performance) | 8 | 2 | 6 |
| Medium (i18n gaps) | 3 | 2 | 1 |
| Medium (stale docs) | 6 | 6 | 0 |
| Algorithm | 7 | 0 | 7 |
| Schema migrations | 27 | 10 | 17 |
| Code fixes deferred | 31 | 12 | 19 |
| Installed not wired | 6 | 0 | 6 |
| Tests incomplete | 10 | 3 | 7 |
| Translations | 7 | 0 | 7 |
| Infrastructure | 8 | 0 | 8 |
| Large file decomposition | 4 | 0 | 4 |
| Competitor features | 140 | 0 | 140 |
| **TOTAL** | **389** | **80** | **309** |

---

## SESSION 2 PROGRESS (2026-03-23)

**96 fixes applied across 5 waves, 62 verified done in this file, 49 bonus fixes beyond original TODO items.**

| Wave | Focus | Key Fixes |
|------|-------|-----------|
| Wave 1 | Critical bugs & rule violations | BottomSheet BackHandler, PostCard long-press, Math.random removals (live, FloatingHearts, conversation), duet/stitch video pickers, Chat View JSX, story-viewer useHaptic, deploy checklist corrections |
| Wave 2 | UI/UX polish & theme | System theme fix, light mode partial fix, marketplace star/currency, Avatar fontWeight, GradientButton layout, VideoPlayer SafeArea/StatusBar/mini-player, GDPR export cap, search i18n (28 keys), edit-profile i18n |
| Wave 3 | Schema + moderation + tests | VideoCommentLike model, ScholarQuestionVote, HalalVerifyVote, indexes (CallSession/Embedding/Order), Tip @@unique, StickerPack ownerId, thread/video/channel moderation, notification dedup, unread-counts endpoint, follower count optimistic update, chat image lightbox, chat URL linkify, personalized-feed spec (21->42), content-safety spec (14->36), recommendations spec (15->29) |
| Wave 4 | Features + notifications + Quran | Report FK fields, Tip stripePaymentId, Embedding FKs, WaqfDonation model, zakat-calculator API, islamic-calendar API, ogApi.ts, banned.tsx, file size limits, DM privacy, translation cache invalidation, sticker count atomic, scheduled message auto-send, Quran room management, 8 notification emissions wired, notification cleanup cron, circle invite notifications |
| Wave 5 | Dead letter queue (in progress) | BullMQ dead letter queue implementation |

**Test suite: 4,552 tests passing, 0 failures, 0 TypeScript errors.**
