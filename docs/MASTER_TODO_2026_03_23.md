# MASTER TODO — Every Single Finding That Needs Work (2026-03-23)

> Consolidated from: 291 gaps audit items, 80 DEFERRED_FIXES items, 29-dimension audit,
> deploy checklist, algorithm audit, memory files, and line-by-line verification.
> NOTHING omitted. If it needs work, it's here.

---

## CRITICAL — App Store / Launch Blockers

- [ ] Apple IAP package not installed (App Store will reject coin purchases via Stripe)
- [ ] App icon 69-byte placeholder (build will crash)
- [ ] App splash 69-byte placeholder (build will crash)
- [ ] Apple Developer $99/yr enrollment
- [ ] WebRTC not wired (react-native-webrtc installed, 0 RTCPeerConnection code)
- [ ] Clerk still uses TEST keys (sk_test_, pk_test_) — need production instance
- [ ] Stripe still uses TEST keys — need live keys
- [ ] APP_URL still localhost:3000 — share links/QR codes broken
- [ ] Deploy checklist has WRONG webhook URLs (/auth/webhook should be /webhooks/clerk, /payments/webhook should be /payments/webhooks/stripe)
- [ ] No custom domain configured (api.mizanly.app, mizanly.app)

## HIGH — Broken/Dead-End Features

- [ ] duet-create: 0 upload refs — full creation UI, can't upload video
- [ ] stitch-create: 0 upload refs — full creation UI, can't upload video
- [ ] zakat-calculator: 0 API calls — calculates locally, never saves, never fetches live gold prices
- [ ] islamic-calendar: 0 API calls — renders calendar without fetching events from backend
- [ ] ogApi.ts missing — backend OG module exists, mobile can't call it
- [ ] altProfileApi.ts exists but 0 screens import it — flipside feature dead
- [ ] communityNotesApi.ts exists but 0 screens import it — community notes dead on mobile
- [ ] Payments mostly unused — only send-tip.tsx uses paymentsApi. donate/gift-shop/waqf have TODO stubs
- [ ] Chat lock PIN visible — 0 secureTextEntry refs (security issue)
- [ ] DM from non-followers unrestricted — 0 messageRequest/dmRequest refs (spam vector)
- [ ] ScreenErrorBoundary doesn't report to Sentry — 0 captureException refs
- [ ] No file size limit on image upload in create-post — OOM risk
- [ ] BottomSheet no Android BackHandler — hardware back doesn't close sheets
- [ ] No banned user screen — banned users see nothing, no explanation
- [ ] PostCard no long-press context menu — 0 longPress refs
- [ ] story-viewer.tsx:149 uses old useHaptic() instead of useContextualHaptic() — rule 17 violation
- [ ] live/[id].tsx:133 uses Math.random() for emoji animation — rule 23 violation

## MEDIUM — Quality/UX Issues

- [ ] BlurHash NOT in PostCard — 0 blurhash refs. Images pop in without placeholder
- [ ] No reaction picker on posts (only like/unlike, no LOVE/HAHA/WOW)
- [ ] No story quick-reactions (emoji row at bottom of story viewer)
- [ ] Follower count not refreshed after follow/unfollow on profile
- [ ] No seller analytics in creator dashboard
- [ ] No focus management after BottomSheet close (a11y)
- [ ] No emoji picker component
- [ ] @mention not highlighted in RichText (looks like regular text)
- [ ] Feed doesn't remember scroll position (resets on tab switch)
- [ ] VideoPlayer no SafeArea handling (controls hidden under notch)
- [ ] VideoPlayer no orientation lock on fullscreen
- [ ] VideoPlayer no StatusBar hide on fullscreen
- [ ] No screenshot prevention on 2FA/encryption screens
- [ ] No bidi text handling in RichText (Arabic in English post renders wrong)
- [ ] No group invite link
- [ ] No payout history in cashout screen
- [ ] No force update check (old app versions run forever)
- [ ] No read receipt toggle in settings
- [ ] Old username links break (no redirect)
- [ ] Scheduled posts no timezone handling
- [ ] No unfollow confirmation dialog
- [ ] No trending feed cache (query runs every request)
- [ ] No follower growth chart in analytics
- [ ] Can't share reel to DM
- [ ] No "Edited" label on edited posts
- [ ] No repost attribution (reposted by who?)
- [ ] Images in chat not tappable to fullscreen
- [ ] URLs in messages not linkified/clickable
- [ ] No mention autocomplete in post comments
- [ ] No grid/list view toggle on profile
- [ ] No maintenance mode screen (server down → raw errors)
- [ ] No device fingerprinting (1000 accounts per phone)
- [ ] Link preview not used in PostCard (component exists, not imported)
- [ ] Rate limit 429 handling weak (1 ref only, should show user-friendly message)
- [ ] Token refresh 401 handling weak (socket has it, API client limited)
- [ ] No app rating prompt (expo-store-review not installed)
- [ ] R2 CORS not configured on bucket
- [ ] R2 lifecycle rules not set (temp uploads pile up)
- [ ] Sentry source maps not configured for EAS builds
- [ ] Resend domain not verified (emails may go to spam)
- [ ] No landing page (mizanly.com)
- [ ] No admin dashboard UI (API exists, no web panel)
- [ ] No moderation dashboard UI (queue exists, no reviewer UI)

## ALGORITHM — Feed/Recommendation Issues

- [ ] Interest vector averages into noise (diverse users get bad recs)
- [ ] No exploration mechanism (new content with 0 views never surfaces)
- [ ] Scoring weights hardcoded (no A/B testing)
- [ ] Session signals in-memory only (resets on restart, won't scale)
- [ ] Islamic boost uses hardcoded prayer hours (not location-aware)
- [ ] Diversity reranking too naive (only same-author prevention)
- [ ] Trending window 48 hours (popular-get-more-popular loop)

## SCHEMA — Deferred Migrations (26 items)

- [ ] C-02: Dual balance system (CoinBalance table + User.coinBalance coexist)
- [ ] C-14: Tip model missing stripePaymentId field
- [ ] C-15: Orders no Stripe PaymentIntent integration
- [ ] m-02: CoinTransactionType enum missing
- [ ] m-03: CoinTransaction currency field missing
- [ ] m-18/19/20: Transaction/order/donation indexes missing
- [ ] m-25: Tip @@unique constraint missing
- [ ] m-28: WaqfFund WaqfDonation relation missing
- [ ] F3: TOTP secret stored plaintext (needs encrypted column)
- [ ] F20: Safety numbers weak (SHA-256 truncation)
- [ ] F22: Envelope store race condition
- [ ] F27: Backup hash unsalted
- [ ] F47-49: Report model missing reportedThreadId/reportedReelId/reportedVideoId
- [ ] F65: VideoCommentLike model missing
- [ ] F20-21: StarredMessage needs join table (currently String[])
- [ ] F-050: Embedding table no FK to Post/User
- [ ] F25: StickerPack missing ownerId field
- [ ] F11: ScholarQuestionVote join table missing
- [ ] F12: HalalVerifyVote join table missing
- [ ] P1-CASCADE-10/11: Report reporter/reportedUser SetNull
- [ ] P1-DANGLING-01-08: 8 dangling FK references
- [ ] P1-FKARRAY-01-03: String[] arrays to join tables
- [ ] P1-INDEX-06-08: Missing indexes
- [ ] P1-MONEY-01-04: Float to Decimal remaining fields
- [ ] P1-DESIGN-01-04: Notification polymorphic, TwoFactorSecret encryption
- [ ] P2-001: Mixed cuid/uuid ID strategy (94 + 61)
- [ ] P2-003: 41 String fields should be enums

## CODE FIXES — Still Deferred (17 items from DEFERRED_FIXES.md)

- [ ] F16: 2FA disconnected from login flow
- [ ] F28: Hardcoded English in push notifications
- [ ] F33: updateControls no PIN re-verification
- [ ] P2-25: Circle members not notified on add/remove
- [ ] F44: Thread images not moderated before save
- [ ] F45: Video description/thumbnail not moderated
- [ ] F46: Channel name not moderated
- [ ] F35: Chat export unbounded memory (needs streaming)
- [ ] F10: Challenge accepts absolute progress (needs server-side tracking)
- [ ] F24: Sticker count not atomic
- [ ] F16/17/18: AI cost controls (no per-user quota)
- [ ] F25: Translation cache not invalidated on content update
- [ ] F26: Story chain participant count race condition
- [ ] F24: Ban doesn't invalidate Clerk session
- [ ] F27: Duplicate moderation systems (moderation.service + content-safety.service)
- [ ] C-05: Notification deduplication missing
- [ ] M12: No dead letter queue for BullMQ

## INSTALLED BUT NOT WIRED (packages exist, 0 usage)

- [ ] react-native-shared-element — installed, no SharedElement in screens
- [ ] react-native-maps — installed, MosqueFinder doesn't use MapView
- [ ] Lottie — no .json animation files, no LottieView
- [ ] Social auth Google/Apple — disabled buttons in sign-in/sign-up
- [ ] Green screen ML segmentation — needs TFLite model
- [ ] LocationPicker — expo-location installed but uses hardcoded mosques

## TESTS — Incomplete

- [ ] Ralph test batch 3 (~1,050 planned tests never executed)
- [ ] 8 large audit docs unread line-by-line (may contain additional findings)

## TRANSLATIONS — Human Required

- [ ] Urdu (ur): 14% translated
- [ ] Bengali (bn): 14% translated
- [ ] French (fr): 15% translated
- [ ] Indonesian (id): 16% translated
- [ ] Malay (ms): 15% translated
- [ ] Arabic (ar): 77% translated
- [ ] Turkish (tr): 89% translated

## INFRASTRUCTURE — NOT BUILT

- [ ] No landing page (mizanly.com)
- [ ] No analytics/attribution
- [ ] No A/B testing framework
- [ ] No admin dashboard web UI
- [ ] No moderation dashboard web UI
- [ ] No widget support (iOS/Android home screen)
- [ ] No DNS configured
- [ ] Metro bundler version conflict (need metro@0.83.5 at root)

## COMPETITOR FEATURES — Post-Launch (140 items)

Not listed individually here — see GAPS_COMPLETE_VERIFIED_2026_03_23.md sections G, S-WW for the full list of 140 feature requests including AR filters, map search, shopping checkout, AI chat, collaborative playlists, business profiles, etc.

---

## COUNTS

| Category | Items |
|----------|-------|
| Critical (launch blockers) | 10 |
| High (broken features) | 17 |
| Medium (quality/UX) | 43 |
| Algorithm | 7 |
| Schema migrations | 27 |
| Code fixes deferred | 17 |
| Installed not wired | 6 |
| Tests incomplete | 2 |
| Translations | 7 |
| Infrastructure | 8 |
| Competitor features | 140 |
| **TOTAL** | **284** |

Of these, ~97 are actionable code fixes, 27 are schema migrations, 7 are translations (need human), 8 are infrastructure, and 140 are feature requests for post-launch.
