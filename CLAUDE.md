# CLAUDE.md — Mizanly Project Guide

## MANDATORY: Read All Memory Files Before Any Task

At the start of every session, read ALL files in `~/.claude/projects/C--dev-mizanly/memory/` (listed in MEMORY.md):
- `user_shakhzod.md` — who the user is, preferences, communication style
- `feedback_*.md` — all feedback files (brutal honesty, no subagents, no co-author, max effort, Islamic data manual, subagent context quality)
- `reference_competitor_intel.md` — UpScrolled, Muslim Pro, market data
- `project_*.md` — project state, gaps audit, deployment status (numbers may be stale — verify against code)

---

## What is Mizanly?
Mizanly (ميزانلي) — a culturally intelligent social platform for the global Muslim community.
Five "spaces" combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube in one app.
Brand: Emerald #0A7B4F + Gold #C8963E | Dark-mode primary | Arabic RTL support

## The Five Spaces
| Space | Arabic | Model | Status |
|-------|--------|-------|--------|
| Saf | الصف | Instagram (feed + stories) | Built |
| Majlis | المجلس | X/Twitter (threads) | Built |
| Risalah | رسالة | WhatsApp (DMs + groups) | Built |
| Bakra | بكرة | TikTok (short video) | Built |
| Minbar | المنبر | YouTube (long video) | Built |

---

## Current State (as of 2026-03-25, post-session 5)

**Backend:** NestJS 10, 80 modules, 82 controllers, 86 services, 193 Prisma models, 82 enums (4,704 lines). 310 test suites, 5,311 tests, 100% pass, 0 TypeScript errors. Server starts clean.
**Mobile:** React Native Expo SDK 52, 213 screens, 84 components, 28 hooks, 36 API services. 0 mobile TypeScript errors (`npx tsc --noEmit` exits clean).
**i18n:** 8 languages (en, ar, tr, ur, bn, fr, id, ms), 3,500+ keys each, ~400 keys added in session 2.
**Real-time:** Socket.io on 4 screens (chat, calls, Quran rooms, conversation list) with Clerk JWT auth, reconnection, token refresh. Redis pub/sub for notification delivery to socket rooms.
**Algorithm:** 3-stage ranking (pgvector KNN → weighted scoring → diversity reranking), k-means multi-cluster interest vectors (2-3 centroids), 15% exploration slots, hashtag diversity reranking, Islamic boost location-aware via prayer-calculator, session signals in Redis, trending 24h window with 12h decay, HNSW vector index, cursor-based keyset pagination.
**Payments:** Stripe PaymentIntent wired on donate, gift-shop, waqf, orders, send-tip. 4 cashout wallet endpoints (balance, payment-methods, cashout, payout-history). Apple IAP not installed.
**All credentials configured** (33/34 — only APP_URL production). Meilisearch Cloud now configured. R2, Cloudflare Stream, Sentry, Resend, Stripe, TURN, Gemini, Whisper, Claude, GIPHY all SET.
**GIPHY SDK:** Beta key active (100 searches/hr). Production key requires app demo + approval — apply before launch when screens are ready. SDK gives GIF search + GIPHY Text (animated text stickers) + Stickers + Clips.
**Schema:** 55 Prisma enums (all 41 String→Enum complete). 7/8 dangling FK relations fixed (1 unfixable — polymorphic). StarredMessage + WaqfDonation + VideoCommentLike + ScholarQuestionVote + HalalVerifyVote join tables. 25+ indexes. previousUsername for redirect. Privacy settings server-side. TOTP encryption + backup salt fields.
**RTL:** Complete — ~430 margin/padding/position replacements across 134 files.
**Security:** Pre-save moderation on all content types, AI prompt XML hardening, device fingerprint (5/device), nsfwjs client-side service ready, file size limits on uploads.
**Video Editor:** FFmpeg-kit full-gpl. **10 tool tabs** (trim, speed, filters, adjust, text, music, volume, effects, voiceover + quick actions bar). 35 edit state fields tracked in undo/redo. 118 FFmpeg engine tests + 10 concat tests. See "Session 3 — What Was Built" below for complete feature list.
**Packages installed (session 3):** ffmpeg-kit-react-native 6.0.2 (full-gpl via Expo config plugin), expo-screen-orientation, expo-screen-capture, expo-store-review, expo-speech, nsfwjs + @tensorflow/tfjs + @tensorflow/tfjs-react-native.
**Packages installed (session 4):** @giphy/react-native-sdk 5.0.2 (GIF search + Text stickers + Clips + Emoji, Expo config plugin at plugins/giphy-sdk/).
**Database synced** — `prisma db push` confirmed in sync. Production uses `prisma migrate deploy`.
**CI/CD:** GitHub Actions — lint-typecheck PASS, test-api PASS, build-api PASS. build-mobile needs `npm install --legacy-peer-deps` (metro removed from root, vuln overrides added).
**~1030 commits**, 11 waves in session 2 + 29 commits in session 3.

---

## Production Deployment (as of 2026-03-24)

### Live Infrastructure
| Service | Provider | URL / Status |
|---------|----------|-------------|
| **API** | Railway (Nixpacks) | `https://mizanlyapi-production.up.railway.app` — LIVE |
| **Database** | Neon PostgreSQL 16 | Connected (use direct URL, not pooler for migrations) |
| **Cache** | Upstash Redis | Connected |
| **Storage** | Cloudflare R2 | Configured (bucket: mizanly-media) |
| **Video** | Cloudflare Stream | Configured |
| **Auth** | Clerk | Connected (TEST keys — switch to live before launch) |
| **Payments** | Stripe | Connected (TEST keys) |
| **Email** | Resend | Configured (domain not yet verified) |
| **Monitoring** | Sentry | Configured |
| **Search** | Meilisearch Cloud (NYC) | CONFIGURED — `ms-5326bee5cc29-43792.nyc.meilisearch.io`, 6 indexes, needs Railway env vars |

### Domain Setup (2026-03-24)
- **Domain:** `mizanly.app` — registered on Namecheap (expires 2027-03-23)
- **DNS:** Cloudflare (Free plan) — nameservers `macy.ns.cloudflare.com` + `neil.ns.cloudflare.com`
- **SSL/TLS:** Full (Strict)
- **AI Bot Blocking:** ON (block on all pages)
- **Cloudflare Zone ID:** `a80d909cd5b47fdb4dcba31a66a3283b`

### Custom Domain Wiring (TODO)
1. **Cloudflare DNS:** Add CNAME `api` → `mizanlyapi-production.up.railway.app` (Proxy ON)
2. **Railway:** Settings → Custom Domain → add `api.mizanly.app`
3. **Update env vars (Railway + local):**
   - `APP_URL` → `https://api.mizanly.app`
   - `API_URL` → `https://api.mizanly.app`
   - `CORS_ORIGINS` → add `https://mizanly.app`
4. **Update mobile .env:**
   - `EXPO_PUBLIC_API_URL` → `https://api.mizanly.app/api/v1`
   - `EXPO_PUBLIC_WS_URL` → `https://api.mizanly.app`

### Railway Config (`apps/api/railway.json`)
```json
{
  "build": {
    "builder": "NIXPACKS",
    "installCommand": "npm install --legacy-peer-deps",
    "buildCommand": "npx prisma generate && npx prisma migrate deploy && rm -rf dist && npx nest build && ls dist/main.js"
  },
  "deploy": {
    "startCommand": "node dist/main.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/api/v1/health/live"
  }
}
```

### Entry Point (`apps/api/src/main.ts`)
- Port: `process.env.PORT || 3000`, listens on `0.0.0.0`
- Global prefix: `/api/v1`
- CORS from `CORS_ORIGINS` env (comma-separated)
- Helmet + compression + 1mb request limit
- Swagger: development only
- Sentry: initialized before app creation
- Socket.io Redis adapter: initialized after app setup

### CI/CD (`.github/workflows/ci.yml`)
| Job | Depends On | Services |
|-----|-----------|----------|
| lint-and-typecheck | — | — |
| build-mobile | lint-and-typecheck | — |
| test-api | lint-and-typecheck | postgres:16, redis:7 |
| build-api | test-api | — |

### Environment Variables (32/34 configured)
**Set:** DATABASE_URL, DIRECT_DATABASE_URL, CLERK_SECRET_KEY (test), CLERK_PUBLISHABLE_KEY (test), CLERK_WEBHOOK_SECRET, REDIS_URL, STRIPE_SECRET_KEY (test), STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, CF_STREAM_ACCOUNT_ID, CF_STREAM_API_TOKEN, CF_STREAM_WEBHOOK_SECRET, RESEND_API_KEY, SENTRY_DSN, TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL, TOTP_ENCRYPTION_KEY, GOLD_PRICE_PER_GRAM, SILVER_PRICE_PER_GRAM, NODE_ENV, PORT, CORS_ORIGINS
**Empty:** MEILISEARCH_HOST, MEILISEARCH_API_KEY
**Needs update for production:** APP_URL (localhost:3000 → api.mizanly.app), API_URL (same)

### Mobile .env (current)
```
EXPO_PUBLIC_API_URL=https://mizanlyapi-production.up.railway.app/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_WS_URL=https://mizanlyapi-production.up.railway.app
EXPO_PUBLIC_GIPHY_API_KEY=<beta key>
```

---

## Session 3 — What Was Built (2026-03-24)

**29 commits. 4,934 tests (+194). 7 audit rounds. 45 bugs found and fixed.**

### Video Editor Features (Complete List)

**Files:** `apps/mobile/app/(screens)/video-editor.tsx` (2,566 lines), `apps/mobile/src/services/ffmpegEngine.ts` (673 lines)

| Category | Features |
|----------|----------|
| **Trim** | Gesture-based drag handles (onStart captures initial pos), split at playhead, reset trim |
| **Speed** | 6 presets (0.25x–3x) + 5 speed curves (Montage/Hero/Bullet/FlashIn/FlashOut) with variable PTS |
| **Filters** | 13 presets: original, warm, cool, B&W, vintage, vivid, dramatic, fade, emerald, golden, night, soft, cinematic |
| **Color Grading** | Brightness, contrast, saturation sliders (-100 to +100 → FFmpeg eq). Temperature slider (→ colorbalance) |
| **Text** | Overlay with timing (appear/disappear via enable='between(t,...)'), 5 size presets (24-80pt), background box, drop shadow, font/color selection, TTS preview (expo-speech), emoji picker |
| **Music** | Real MusicPicker (449-line component, genre search, preview). Volume mixing (original + music). Track displayed with remove button |
| **Audio** | 6 voice effects (robot/echo/deep/chipmunk/telephone). Audio pitch (-6 to +6 semitones). Noise reduction (highpass+lowpass+afftdn). Fade in/out (off/0.5s/1s/2s). Voiceover recording (real Audio.Recording, mixed into export via filter_complex) |
| **Video Effects** | Reverse, stabilization (deshake), sharpen (unsharp), vignette, film grain (noise), rotation (90/180/270° transpose), horizontal flip (hflip), vertical flip (vflip), glitch (RGB channel split rgbashift), letterbox (cinema bars drawbox), boomerang (post-export forward+reverse concat), freeze frame (tpad) |
| **Aspect Ratio** | 9:16, 16:9, 1:1, 4:5 with center crop using min() to prevent overflow |
| **Undo/Redo** | 20-deep stack, 35 fields captured via captureSnapshot/applySnapshot, every edit action pushes undo |
| **Export** | 720p (CRF 28) / 1080p (CRF 23) / 4K (CRF 18). Progress callback + cancel. returnTo param passes URI to caller. Fallback upload-with-metadata when FFmpeg unavailable (all 35 fields included). Android file:// URI normalization |
| **Quick Actions Bar** | Undo, redo, reverse toggle, aspect ratio cycle, auto-captions link |

### Create-Reel Features
- Multi-clip recording (record→pause→record, 60s total capacity)
- FFmpeg concat with 8 transition types (fade/dissolve/wipeleft/wiperight/slideup/slidedown/circleopen/circleclose)
- Transition selector badge (cycles on tap)
- Clip counter, delete last clip, progress bar
- 3-2-1 countdown timer (wired to real recording with interval cleanup on unmount)
- Discard confirmation (Alert.alert when clips.length > 0)
- Edit button → video-editor with returnTo
- Video onLoad captures real duration from route params

### Other Packages Wired
- expo-screen-orientation → VideoPlayer.tsx fullscreen landscape lock
- expo-screen-capture → 2fa-setup.tsx + verify-encryption.tsx screenshot prevention
- expo-store-review → _layout.tsx prompts after 7 sessions
- expo-speech → video editor TTS preview
- nsfwjs + tensorflow → nsfwCheck.ts service activates automatically

### Bugs Found & Fixed (7 audit rounds, 45 total)
Full list in `~/.claude/projects/C--dev-mizanly/memory/project_session3_complete.md`. Key categories:
- Gesture math (trim handle compounding, volume slider magic number)
- Async patterns (runOnJS, session ID race, countdown interval leak)
- FFmpeg correctness (reverse+trim, atempo chaining, text escaping, speed curve DURATION var, aspect ratio overflow, boomerang audio, voice+pitch conflict)
- State completeness (undo snapshot missing fields, export dep array, fallback metadata missing 25 fields)
- Resource leaks (voiceover Audio.Recording on unmount, TTS Speech on unmount, iOS audio mode not reset)
- i18n (35 keys in wrong JSON namespace, fixed via Node script)
- Platform (Android file:// URI not normalized for FFmpeg)

### Video Editor — Known Design Limitations
1. **Waveform is cosmetic** — deterministic sine wave, not from actual audio. Needs FFprobeKit audio peak extraction.
2. **Font selection has no effect on export** — FFmpeg drawtext doesn't resolve platform font paths. Needs iOS/Android fontfile= resolution.
3. **Music mixing uses CDN URL directly** — works but adds network latency. Should pre-download to cache.
4. **No real-time filter preview** — expo-av Video doesn't support shaders. User only sees filter after export. Needs OpenGL/expo-gl.
5. **iOS config plugin uses monkey-patched pre_install** — documented community approach, fragile across CocoaPods versions.

---

## Session 4 — What Was Built (2026-03-24 continued)

**28 commits. 5,093 tests (+159). 3 audit rounds. 23 bugs found and fixed. All pushed to GitHub.**

### New Components Built
| Component | Lines | Purpose |
|-----------|-------|---------|
| `GifSticker.tsx` | 400 | Waterfall masonry GIF search + GIPHY native dialog, blurhash placeholders |
| `MusicSticker.tsx` | 310 | 3 display modes (compact pill/waveform/lyrics), word-by-word lyric highlighting |
| `LocationSticker.tsx` | 320 | Real expo-location GPS + reverse geocode, gradient pill display |
| `CreateSheet.tsx` | 370 | Premium 2×2 grid + compact rows, spring press, shadows, glow accents |
| `AnimatedAccordion.tsx` | 140 | Reanimated 3 spring height animation, chevron rotation, press feedback |
| `RichCaptionInput.tsx` | 210 | Live syntax highlighting (#hashtags→emerald, @mentions→blue, URLs→gold) |
| `UploadProgressBar.tsx` | 180 | XMLHttpRequest progress tracking, spring-animated fill, cancel support |
| `giphyService.ts` | 200 | Unified GIPHY API/SDK interface, search/trending/stickers/text |
| `giphy-sdk/app.plugin.js` | 60 | Expo config plugin for GIPHY SDK (Fresco resolution) |

### Sticker System (10 interactive types — all from checklist)
| Sticker | What it does |
|---------|-------------|
| Poll | Spring percentage bars, haptic on vote, press feedback on options |
| Quiz | 24 ticker-tape confetti (gravity + rotation + varied shapes), haptic success/error |
| Question | Immediate optimistic submit (no fake setTimeout) |
| Countdown | All strings i18n'd, emoji→Icon |
| Emoji Slider | Haptic ticks at quarter marks during drag |
| Location | Real GPS + reverse geocode, gradient pill with shadow glow |
| Link | URL truncation, favicon, "See More" CTA |
| Add Yours | GradientButton, participant count, chain entry |
| GIF | Waterfall masonry, GIPHY native SDK dialog as primary, blurhash |
| Music | Compact pill + waveform bars + word-by-word lyrics (3-line scroll) |

### Navigation Restructure
- **5-tab bar** (was 6): Saf, Bakra, Minbar, Majlis, Risalah
- **Create moved to header**: emerald gradient "+" button with spring press
- **CreateSheet**: 4 primary cards (Post/Story/Reel/Thread) + 3 secondary rows

### Create Flow Quality (ALL 7 screens polished)
| Screen | Haptics | Spring press | Entrance anim | Rich text | Progress bar |
|--------|---------|-------------|---------------|-----------|-------------|
| create-post | success/error | AnimatedAccordion | FadeInUp | RichCaptionInput | UploadProgressBar |
| create-story | tick/success | Sticker drag spring | FadeIn/FadeInDown | — | — |
| create-thread | tick/success/error | Scale on add/vis | FadeInUp parts | — | — |
| create-reel | tick (session 3) | Clip scale | FadeInDown | — | — |
| create-video | tick/success/error | Scale on picker | FadeInUp sections | — | — |
| go-live | send/tick/success/error | FadeInUp already | FadeInUp cards | — | — |
| voice-post | existing | Pulse animation | Animated | — | — |

### Publish Screen Fields (9/11 from checklist)
All use AnimatedAccordion (spring height animation):
- Alt text, Tag people, Collaborator, Who can comment, Share to feed, Allow remixes, Branded content, Topics
- Missing: Schedule posting (separate screen), Trial reel

### DraggableSticker Enhancement
- Haptic vibration on drag start
- Spring scale to 1.08 while dragging, shadow lift (radius 16, elevation 12)
- Springs back on release

### Key Files Changed
| File | Lines | What |
|------|-------|------|
| `create-post.tsx` | ~1,150 | RichCaptionInput, UploadProgressBar, 9 AnimatedAccordion fields |
| `create-story.tsx` | ~1,700 | 12 sticker types, 3-col search tray, GIPHY native primary |
| `story-viewer.tsx` | ~900 | Renders all new sticker types (gif/link/addYours/music/location) |
| `(tabs)/_layout.tsx` | ~200 | 5-tab nav, hidden create tab |
| `(tabs)/saf.tsx` | ~700 | CreateHeaderButton replacing camera icon |

### Tests Added (+159)
| File | Tests | Covers |
|------|-------|--------|
| `story-stickers.spec.ts` | 49 | All 12 sticker types, serialization, responses |
| `publish-fields.spec.ts` | 42 | Alt text, tags, collaborator, comments, topics, GIPHY, file size |
| `giphy-service.spec.ts` | 45 | URL construction, response parsing (15 cases), error handling, categories |
| `create-sheet.spec.ts` | 23 | Options structure, animation timing, scale feedback, gradients, a11y |

### Audit Findings Fixed (23 total)
| Round | Critical | Bugs | i18n | Cleanup |
|-------|----------|------|------|---------|
| 1 | GIPHY API wired | ActivityIndicator→Skeleton | Hardcoded strings | Unused imports |
| 2 | Duplicate `isSDKAvailable()` crash | Dead lyric animation | 19 strings unwired | 7 cleanups |
| 3 | Dangling code fragment | Type safety `as never` | Topics hardcoded | Hidden create tab |

---

## SESSION 4 CHECKLIST — Creation Flow & Interactive Features (UPDATED)

### Interactive Story Stickers (Instagram parity — HIGH PRIORITY)
- [x] Poll sticker (spring bars, haptic vote, press feedback)
- [x] Quiz sticker (24 ticker-tape confetti, gravity physics, haptic)
- [x] Question box sticker (immediate optimistic submit)
- [x] Countdown sticker (all i18n, emoji→Icon)
- [x] Emoji slider sticker (haptic ticks at quarter marks)
- [x] Location sticker (real expo-location GPS + reverse geocode)
- [x] Link sticker (URL truncation, favicon, See More CTA)
- [x] "Add Yours" chain sticker (GradientButton, participant count)
- [x] GIF search sticker (waterfall masonry + GIPHY native SDK dialog)
- [x] Music sticker (compact/waveform/lyrics, word-by-word highlighting)

### Publish Screen Fields (Table stakes)
- [x] Location tag on post/reel publish (LocationPicker wired)
- [x] Tag people in post (AnimatedAccordion, chip badges)
- [x] Invite collaborator (AnimatedAccordion, description)
- [x] Topics/categories selector (10 categories, max 3, i18n labels)
- [x] Schedule posting (SchedulePostSheet built, backend scheduledAt wired, 50+ queries patched — Session 5)
- [x] Alt text for accessibility (AnimatedAccordion, 1000 char, CharCountRing)
- [x] Remix settings (toggle in advanced settings)
- [x] Who can comment selector (radio group in AnimatedAccordion)
- [x] Share to feed toggle (in advanced settings)
- [x] Branded content / paid partnership label (toggle + partner field)
- [x] Trial reel (isTrial field + publishTrial endpoint + feed filters — Session 5)

### Photo Carousel Posts (TikTok/Instagram)
- [x] Multi-photo upload (up to 35 slides — Session 5, create-carousel.tsx ~800 lines)
- [x] Music attachment on carousel (MusicPicker integration — Session 5)
- [x] Per-slide text overlay (carouselTexts[] — Session 5)
- [x] Swipe navigation (ImageCarousel with dot indicators — Session 5)
- [x] Drag-to-reorder (moveSlide arrows — Session 5)

### Story Drawing Tools (Instagram/Snapchat parity)
- [x] Freehand pen (color picker + size — Session 5, DrawingCanvas.tsx)
- [x] Highlighter pen (20px width, 0.3 opacity — Session 5)
- [x] Neon glow pen (2-pass: glow + sharp — Session 5)
- [x] Eraser (SVG Defs+Mask technique — Session 5)
- [ ] Eyedropper (pick color from image) — NOT BUILT

### "2026 Wow" Features
- [ ] AI stickers (type text → generate image via Claude/Gemini)
- [ ] AI backdrop (text prompt → background replacement)
- [ ] Auto-captions with word emphasis styling
- [ ] Thumbnail A/B testing (for Minbar videos)
- [ ] Custom sticker creation (cut out from photo)

### Non-Editor Priorities (Deferred from Session 3)
- [x] WebRTC calls wiring (useWebRTC.ts complete rewrite, 13 fixes — Session 5. BUT: 3 missing socket emits + CallType mismatch = calls still non-functional end-to-end)
- [x] Wire react-native-maps into MosqueFinder (MapView with emerald markers — Session 5)
- [x] Wire expo-location into LocationPicker (geocodeAsync + reverseGeocodeAsync — Session 5)
- [x] Performance sweep (search memoization, bakra currentIndex fix, imageResize — Session 5. Partial: more screens need React.memo)
- [ ] Quran recitation audio CDN — NOT BUILT

---

## Session 6 — Architecture Compilation (2026-03-25 continued)

**0 code changes. docs/ARCHITECTURE.md compiled from 44 raw extraction files.**

### What Was Produced
- `docs/ARCHITECTURE.md` — 11,000+ line compiled architecture reference, 89 sections
- 193 Prisma models documented field-by-field
- 1000+ API endpoints cataloged
- 82 bugs/gaps cataloged in Section 89 (the most important section for next session)
- 10 end-to-end data flow diagrams
- All 13 FFmpeg filter presets with exact commands
- Full payment currency model with 7 broken flows documented
- Complete notification pipeline (create → push → socket delivery)
- Full moderation pipeline (11 word filter regexes, Claude AI prompt, appeal lifecycle)

### ⚠️ CRITICAL FOR NEXT SESSION — Bug Registry
**Section 89 of ARCHITECTURE.md contains 82 bugs across 4 severity levels.** This is the most actionable section. Priority order for fixing:
1. P0 bugs 1-5 (WebRTC calls, coin purchase, dual balance)
2. P1 bugs 6-19 (payments, moderation, scheduled content)
3. Privacy bugs 63-69 (EXIF leak, phone number PII, GDPR gaps)
4. P2 bugs 20-62 (unreachable code, DTO mismatches, missing endpoints)

### What the Document Does NOT Cover (honest gaps)
- ~35% of raw data not compiled (mobile screen internals, service method details for 10 modules)
- Architecture decisions rationale (WHY each tech was chosen) — in bugs-decisions-gaps.md but not compiled
- WebRTC Part 2 (ICE negotiation, TURN rotation) — not compiled
- ParentalControls full service (PIN flow, child linking) — not compiled
- 62 of 84 mobile component implementations — not compiled
- Some values (XP amounts, level thresholds) may be from CLAUDE.md memory, not verified against code

---

## Session 5 — What Was Built (2026-03-25)

**31 commits. 5,226 tests (+133). 14-agent parallel audit + 40-agent architecture extraction. All pushed.**

### Publish Fields Wired to Backend
- 7 new fields: taggedUsers, collaboratorUsername, commentPermission, shareToFeed, brandedContent, brandPartner, remixAllowed, topics
- PostTaggedUser + ReelTaggedUser join tables, CommentPermission enum, TagApprovalStatus enum
- Comment permission enforced in posts.addComment() and reels.comment() with owner bypass
- Thread addReply FOLLOWING direction FIXED, MENTIONED now checks thread.mentions.includes(username)

### Photo Carousel Posts (create-carousel.tsx ~800 lines)
- Multi-photo (up to 35 slides), numbered thumbnails, reorder arrows, per-slide text
- ImageCarousel rewritten: Instagram-style dots (max 5 visible, sliding window), ProgressiveImage, prefetch
- Fixed: contentType undefined CRASH, folder 'reels' rejects images, dead MIME_MAP removed

### Scheduled Content (50+ queries patched)
- ALL feed queries: `scheduledAt: null` → `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]`
- 36 queries in search/hashtags/personalized-feed/recommendations/feed/users
- 9 pre-existing converted, 3 with OR conflicts merged via AND

### WebRTC Complete Rewrite (useWebRTC.ts)
- Research-based rewrite using react-native-webrtc v124 documented patterns
- 13 issues fixed: pc.ontrack (not addEventListener), Pattern B streams, callback refs, mountedRef, applyConstraints camera flip, stream.release(), ICE queue (max 200), signal filtering, offer options

### Performance
- search.tsx: memoized 3 row components, 8 FlatLists optimized (windowSize+maxToRenderPerBatch)
- bakra.tsx: currentIndex removed from renderItem deps (uses currentIndexRef + extraData)
- imageResize.ts: GIF/PNG preserved, small JPEGs skip re-encoding

### Architecture Documentation
- 40 parallel Explore agents extracted every layer of codebase
- Raw data: docs/architecture-raw-2026-03-25/ (195 files, 856 KB)
- Compiled: docs/ARCHITECTURE.md (1,189 lines — target 10K in dedicated session)
- Master prompt: docs/ARCHITECTURE_COMPILATION_PROMPT.md

### Session 5 — Critical Bugs Found by Agents (MUST FIX)
1. **WebRTC: 3 missing socket emits** — call_initiate, call_answer, call_end never emitted from mobile → calls non-functional end-to-end
2. **WebRTC: CallType enum mismatch** — Socket DTO validates 'AUDIO'/'VIDEO' but REST uses VOICE/VIDEO → socket rejects
3. **Coin purchase webhook NOT crediting** — handleGiftPaymentIntentSucceeded not implemented → coins never arrive
4. **Waqf contribution endpoint MISSING** — POST /community/waqf/{id}/contribute doesn't exist → waqf donations fail
5. **Dual CoinBalance system** — User.coinBalance (legacy) vs CoinBalance table (correct) → reading wrong one = wrong balance
6. **Owner can't see own scheduled/trial content** on profile feed queries
7. **Frontend doesn't hide comment input** when permission is NOBODY → users get 403
8. **Tag approval workflow dead** — status field exists but no approve/decline endpoint

### Session 5 — Items NOT Done (Deferred)
- [ ] Eyedropper tool (pick color from image in drawing)
- [ ] Quran recitation audio CDN
- [ ] AI stickers, AI backdrop, auto-captions, thumbnail A/B testing, custom sticker creation (all "2026 Wow")
- [ ] react-native-incall-manager for speaker routing
- [ ] Group calls + screen sharing (backend exists, mobile not built)
- [ ] Stripe Connect real payout (getPaymentMethods is placeholder)
- [ ] 2FA enforced at Clerk login (needs session claim integration)
- [ ] Meilisearch deployment (search still Prisma LIKE fallback)
- [ ] Architecture doc expansion to 10K lines (master prompt ready, needs dedicated session)

## Key Documentation
- `docs/ARCHITECTURE.md` — **Compiled architecture reference (~11K lines, 89 sections, 82 bugs cataloged). READ THE DISCLAIMER AT THE TOP — ~65% depth coverage, some values inferred. Raw files are ground truth.**
- `docs/ARCHITECTURE_COMPILATION_PROMPT.md` — Master prompt used for the compilation (reference only)
- `docs/architecture-raw-2026-03-25/` — **RAW AGENT OUTPUTS (44 files, 43,687 lines, 2.0 MB) — THESE ARE THE AUTHORITATIVE SOURCE. When ARCHITECTURE.md conflicts with raw data, trust raw data.**
- `docs/DEPLOYMENT.md` — Production deployment guide (Railway, Neon, Cloudflare, Clerk, Stripe)
- `docs/DEPLOY_CHECKLIST.md` — Pre-deployment verification checklist
- `docs/TURN_SETUP.md` — WebRTC TURN/STUN server setup
- `docs/ONBOARDING.md` — Developer onboarding guide
- `docs/FULL_AUDIT_2026_03_23.md` — **29-dimension audit with all findings**
- `docs/PRIORITY_FIXES_CHECKLIST.md` — Crossable fix list
- `docs/audit/agents/` — 72 raw audit files (~4,300 findings)
- `docs/audit/DEFERRED_FIXES.md` — Master tracker of deferred items
- `docs/audit/COMPREHENSIVE_AUDIT_2026.md` — 60-dimension audit with line numbers
- `docs/audit/PRIORITY_FIXES.md` — P0/P1 items sorted by severity
- `docs/audit/HONEST_SCORES.md` — Per-dimension scores with evidence
- `docs/audit/MARKET_ANALYSIS.md` — Market sizing, competitor landscape
- `docs/audit/ALGORITHM_DEEP_AUDIT.md` — Feed algorithm improvements
- `docs/audit/TEST_QUALITY_AUDIT.md` — Test suite quality analysis
- `docs/audit/DEEP_AUDIT_INDEX_2026_MARCH21.md` — Index of all 72 agent files
- `docs/audit/SESSION_CONTINUATION_PROMPT.md` — Context for continuing audit work
- `docs/audit/UI_UX_DEEP_AUDIT_2026.md` — UI/UX audit findings
- `docs/COMPETITOR_DEEP_AUDIT_2026.md` — 15-dimension competitor scoring
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — Data import spec (not built)
- `docs/features/EXIT_STORY_SPEC.md` — Exit story spec (not built)
- `docs/ralph-instructions.md` — Autonomous execution behavioral rules
- `docs/plans/2026-03-23-video-editor-design.md` — Video editor FFmpeg integration design
- `docs/plans/2026-03-23-video-editor-competitor-gap-analysis.md` — TikTok/Instagram/YouTube/CapCut feature comparison + build priority

---

## TECHNICAL DEBT — Infrastructure-Dependent Bugs (Cannot Fix Via Code Alone)

These 5 bugs from the 82-bug registry require infrastructure work, schema migrations, or legal decisions. They are NOT code laziness — they genuinely need external action.

| Bug # | Title | Why It Can't Be Fixed in Code | What Needs to Happen |
|-------|-------|------------------------------|---------------------|
| **63** | EXIF data not stripped from uploads | Uploads go directly from mobile to R2 via presigned URL, bypassing the server. The `MediaProcessor` queue code exists but `QueueService` has no `addMediaJob()` method, so the processor is dead code. Mobile sets `exif: false` on image picker (iOS/Android), but other upload paths (web, API direct) are unprotected. | **Option A:** Add `addMediaJob()` to QueueService + call from upload service after presigned URL upload reports completion. **Option B:** Add a Cloudflare Worker on the R2 bucket that strips EXIF on upload via `sharp`. Option B is better (no app changes needed). |
| **69** | BlurHash generated but not stored | Same root cause as Bug 63 — `processBlurHash` in MediaProcessor is dead code because the queue is never invoked. Additionally, the "blurhash" computation is just an average hex color (`#aabbcc`), not a real BlurHash encoding. | Install `blurhash` npm package on backend. Wire `addMediaJob()` in QueueService. Compute real BlurHash (not average color). Store in Post/Reel/Story/Video `blurhash` field. |
| **68** | CSAM/terrorism/AU Online Safety Act reporting stubs | Content auto-hide works (NUDITY/VIOLENCE/TERRORISM reports auto-remove content). But mandatory external reporting to NCMEC CyberTipline, GIFCT hash-sharing, and AU eSafety Commissioner is TODO only. The ToS falsely claims NCMEC reporting is active. | **Legal:** Register with NCMEC as an Electronic Service Provider (requires US legal entity or representative). **Legal:** Register with GIFCT for terrorism hash-sharing. **Legal:** Register with AU eSafety Commissioner. **Code:** Implement API integrations after registration. **Urgent:** Remove false NCMEC claim from ToS before launch. |
| **41** | Chat lock code is per-conversation, not per-user | `lockCode` field is on `Conversation` model, meaning all members share the same lock code. If Alice sets lock code "1234", Bob also needs "1234" to open it. Should be per-member on `ConversationMember`. | Schema migration: add `lockCode String?` to `ConversationMember`. Move existing lock codes. Update `messages.service.ts` to read/write per-member lock. This is a breaking change for any users who've set lock codes. |
| **52** | Safety numbers use SHA-256 truncation instead of Signal SAS | Current implementation hashes public keys with SHA-256 and truncates to display a short verification code. Signal uses a proper Short Authentication String (SAS) protocol with double-ratchet key material. The current approach is cryptographically acceptable for MVP but not production-grade for E2E encryption verification. | Implement Signal SAS protocol or use libsignal's fingerprint comparison. This is a crypto engineering task that should be done when E2E encryption is hardened for production (currently E2E is functional but not audited). |

---

## ⚠️ OPTION B — 428-Finding Gap List (NEXT SESSION)

**The 82-bug registry (Section 89) is Option A. This section tracks Option B — the broader 428-finding master gap list from March 21 that is STILL MOSTLY UNFIXED.**

Sessions 2-5 fixed ~240 audit items from the 72-agent deep audit. But the 428-finding gap list (`~/.claude/projects/C--dev-mizanly/memory/project_complete_gaps_audit_march21.md`) covers deeper UX, safety, and competitive gaps that remain unaddressed. Key categories:

### HIGH PRIORITY (Next session after bug fixes)
- **Transition states (337-341):** No upload progress, no "Publishing..." state, no follow button loading, no comment pending state — 0 across all screens
- **Empty states (342-345):** No "you're caught up" on Bakra, no "say hello" in empty DMs, no "hasn't posted yet" on new profiles
- **Confirmation dialogs (225-228):** No unfollow confirmation, no delete post confirmation, no leave group confirmation, no double-post prevention
- **Content quality controls (122-126):** No hashtag limit per post, no mention limit, no duplicate post detection
- **Abuse vectors (187-196):** No mass-report abuse detection, no bot/fake engagement detection, no self-gift prevention, no purchase verification server-side
- **EXIF stripping (197):** GPS coordinates leak on every uploaded photo — ALSO in bug registry as #63
- **Push notification templates (113-116):** "X liked your post" and "X started following you" push templates — the #1 and #2 vanity notifications — DO NOT EXIST
- **Tab bar badges (117):** No unread badges on tab bar — users can't see unread messages/notifications

### MEDIUM PRIORITY
- **Keyboard handling (23):** Only 16/208 screens have KeyboardAvoidingView
- **FlashList (24):** Only 5 screens use FlashList, 98 use FlatList — main feeds should use FlashList
- **Double-tap like (19):** Only on Saf PostCard, not Bakra reels, Majlis threads, or Minbar videos
- **Optimistic updates (20):** Only 6 files — most likes/follows/saves wait for API
- **Report from content (26):** Only 2 screens have report — should be on every content type
- **Islamic depth (210-216, 279-282):** No Arabic numeral formatting, no Hijri dates on posts, no gender-appropriate Arabic, no community dhikr counter, no Islamic event reminders
- **Creator tools (250-259):** No follower growth chart, no pinned post, no content performance comparison
- **Social proof (130-134):** No reaction picker on posts, no "follows you" badge, no follower count refresh after follow

### LOWER PRIORITY (Post-launch)
- **AR/Camera effects (419-428):** Zero AR exists — major competitive gap vs Instagram/TikTok
- **Concurrency bugs (371-374):** Race conditions under load — need load testing
- **Scale preparedness (233-240):** No trending cache, no write-behind, no read replica, no count caching
- **Legal/compliance (229-232, 398-401):** DSA, DMCA, COPPA, GDPR rights to explanation/restriction

**Full list:** `~/.claude/projects/C--dev-mizanly/memory/project_complete_gaps_audit_march21.md` (428 findings, 82 categories, A through BBBB)

---

## Session 7 — Hardening & Final Polish (2026-03-26)

**106 commits. 1,140 total. 310 test suites, 5,311 tests. 0 mobile TS errors. All pushed.**

### What Was Done

**Gap List Completion (Batches 7-9):**
- Addressed all remaining code-fixable items from the 428-finding gap list
- 25+ new backend endpoints: thread unroll, content analytics, similar accounts, Islamic AI classification, bookmark collections, engagement prediction, content repurpose, notification aggregation, group topics, reel drafts, real-time socket events, and more
- 4 new mobile hooks: useProgressiveDisclosure, useClipboardLinkDetection, useOfflineFallback, useAutoUpdateTimestamp
- A/B testing framework (Redis-backed, 15 tests)
- All new endpoints wired in mobile API service files

**3-Phase Hardening Plan Executed:**

Phase 1 — Stop The Bleeding:
- Redis module: production THROWS without REDIS_URL (no more fake-success proxy)
- Removed 9 duplicate push notification delivery calls (single owner: NotificationsService.create)
- Fixed queue contract violation (VideosService 'upsert' → 'index', processor throws on unknown actions)
- Lint scripts replaced from echo placeholders to real `tsc --noEmit`
- ChatGateway: added OnModuleDestroy (clears timers, unsubscribes Redis)
- Fixed mobile typecheck blockers (bakra orphaned JSX tag, store types, missing state)

Phase 2 — Restore Platform Truth:
- Auth guard: request.user reflects post-auto-unban state
- Webhook: session.created now tracks login via lastSeenAt
- Added scheduledDeletionAt field (separates "will be deleted" from "was deleted")
- CounterReconciliationService: daily/weekly/monthly cron jobs reconcile follower/post/engagement counts
- PublishWorkflowService: centralized onPublish/onUnpublish pipeline
- 4 platform invariant tests (caught real bug: ForYou feed missing isDeactivated filter)
- PlatformServicesModule registered in AppModule (services no longer dead code)

Phase 3 — Performance & Scale Safety:
- Block/mute exclusion caps raised from take:50 to take:10000 (safety-critical)
- Sequential fan-out → batched createMany (Islamic events, screen time digest, follower snapshots)
- MetricsInterceptor: request latency logging with severity tiers
- 7 missing P0 database indexes added (285 total, 75-85% faster feed generation estimated)
- SearchReconciliationService: weekly re-index safety net
- QueryDiagnosticsService: EXPLAIN tooling for hot-path query analysis
- Sentry enhanced: 10% tracing, 5% profiling, transaction grouping, noise filtering

**Meilisearch Live:**
- Meilisearch Cloud (NYC): `ms-5326bee5cc29-43792.nyc.meilisearch.io`
- 6 indexes created and configured (users, posts, threads, reels, videos, hashtags)
- MeilisearchSyncService built for full backfill
- Search now uses Meilisearch first, Prisma ILIKE as fallback
- **TODO:** Add MEILISEARCH_HOST + MEILISEARCH_API_KEY to Railway env vars

**117 Mobile TypeScript Errors → 0:**
- Fixed across 22 files: useWebRTC types, PostCard/profile/post casts, DrawingCanvas SVG, GlassHeader props, ffmpegEngine types, react-native-maps type declarations, missing imports, duplicate declarations

---

## CODEX AUDIT — Remaining Non-Code Items (14 of 54 findings)

The CODEX audit (`docs/audit/CODEX_AUDIT_2026-03-26.md`) identified 54 findings. 40 are now fixed. The remaining 14 require architectural work, external infrastructure, legal processes, or crypto/security specialist review:

### Needs Architectural Work (8)
| # | Finding | What's needed |
|---|---------|--------------|
| 17 | Push notification retry/DLQ | Batch failure retry queue with dead-letter accounting |
| 19 | Queue enforcement in production | Queue should fail loudly (not no-op) when Redis absent in prod |
| 20 | Process-local retry (AsyncJobService) | Replace setTimeout recursion with durable queue-based retry |
| 24 | Email degrades to logging | Resend failure should queue for retry, not just log |
| 29-30 | Trending/recommendation candidate windows | Move scoring from application memory to DB-side ranking (materialized views or dedicated ranking service) |
| 31 | FeedInteraction only tracks postId | Schema change needed: add reelId/threadId columns for cross-content-type seen tracking |
| 34 | Dismissal/session history capped | Redis list caps (200 negative signals, 1000 viewed) lose data for heavy users |
| 38 | Analytics buffering process-local | In-memory buffer lost on crash. Needs write-ahead or durable sink |

### Needs External Infrastructure (3)
| # | Finding | What's needed |
|---|---------|--------------|
| 14 | EXIF retained on original uploads | Cloudflare Worker on R2 bucket to strip metadata on upload |
| 25 | CSAM/terrorism legal compliance | NCMEC registration (US entity), GIFCT hash-sharing, AU eSafety registration |
| 49 | Payment reconciliation heuristic | Replace Redis-TTL mappings with durable payment state store. Stripe webhook → DB first, not Redis first |

### Needs Crypto/Security Specialist (3)
| # | Finding | What's needed |
|---|---------|--------------|
| 39 | Request logging != APM | Per-endpoint latency histograms, DB timing, queue lag accounting (Prometheus/Grafana) |
| 46 | Encryption trust story weak | Upgrade safety numbers from SHA-256 truncation to Signal SAS protocol. Harden key validation |
| 9 (partial) | Full API contract audit | Systematic mobile↔backend contract verification tool (OpenAPI generation or type sharing) |

---

## NOTHING LEFT TO CODE — External Steps Only

All code-fixable items from the 428-finding gap list, 82-bug registry, 3-phase hardening plan, and CODEX audit are complete. The only remaining items require external accounts, credentials, design assets, or human effort:

| Item | What's needed | Unblocks |
|---|---|---|
| **Apple Developer enrollment** | $99/yr at developer.apple.com | iOS builds, App Store submission |
| **App icon + splash screen** | Replace 69-byte placeholders (Canva or designer) | EAS build (crashes without real assets) |
| **Clerk production keys** | Dashboard: toggle test → live | Real user auth |
| **Stripe production keys** | Dashboard: toggle test → live | Real payments |
| **Custom domain CNAME** | Cloudflare DNS: CNAME `api` → Railway (5 min) | Production API URL |
| **Meilisearch Railway env** | Add MEILISEARCH_HOST + API_KEY in Railway dashboard | Production search |
| **Resend domain verification** | DNS TXT record in Cloudflare | Email delivery |
| **google-services.json** | Firebase project for Android push notifications | Android push |
| **First EAS build** | Needs icon + Apple enrollment first | TestFlight / Play Store |
| **5 language translations** | Human translator for ur, bn, fr, id, ms (14-16%) | Full i18n coverage |
| **AR/camera effects** | Snap Camera Kit or Banuba SDK integration | Camera filters |
| **Admin dashboard** | Separate React web app | Admin operations |
| **Moderation dashboard** | Separate React web app | Content moderation UI |

**Priority order:** Apple Developer → App icon → Clerk keys → Custom domain → First EAS build → TestFlight

---

## LAUNCH ROADMAP

### Week 1: Launch Blockers
- [ ] App icon + splash (replace 69-byte placeholders) — designer or Canva
- [ ] Apple Developer enrollment ($99, 48h)
- [ ] Clerk production keys (switch sk_test_ → sk_live_)
- [ ] Stripe live keys
- [ ] APP_URL → production URL (currently localhost:3000) — domain bought, Cloudflare active, CNAME + Railway custom domain pending
- [x] Custom domain (mizanly.app) — bought on Namecheap, Cloudflare DNS active, SSL Full (Strict)
- [ ] Fix metro CI build (remove root metro dep)
- [ ] First EAS build (iOS + Android)

### Week 2: Test With Real Data
- [ ] Upload real images/videos (verify R2 presigned URLs)
- [ ] Send real push notifications (verify FCM + APNs)
- [ ] Process $1 test payment (verify Stripe end-to-end)
- [ ] Real-time messaging (two devices, real conversation)
- [x] Deploy to Railway + verify health endpoint — LIVE at mizanlyapi-production.up.railway.app

### Week 3: Beta Polish
- [ ] TestFlight / Play Store internal testing (first 10 users)
- [ ] Fix bugs from beta testers
- [ ] App Store screenshots + description
- [ ] Landing page at mizanly.app
- [ ] GIPHY production key application (requires demo video of app screens showing GIF integration)

### Month 2: Post-Launch
- [ ] WebRTC calls wiring (~500-800 lines, TURN credentials ready)
- [ ] Apple IAP for iOS coin purchases
- [ ] Meilisearch deployment (search falls back to Prisma LIKE for now)
- [ ] Human translations for 5 languages (ur, bn, fr, id, ms)

### Month 3+: Growth
- [ ] nsfwjs on-device + pHash re-upload detection
- [ ] Whisper.cpp on RTX 5070 (self-hosted transcription)
- [x] Interest vector multi-cluster — DONE (Wave 10 — k-means 2-3 centroids)
- [ ] Expo Web PWA (desktop version) — mobile-first, web later
- [ ] Data import from Instagram/TikTok/X/YouTube/WhatsApp

## PACKAGES WAITING FOR INSTALL (code wired, need terminal)

Run these in Windows terminal when back home:
```bash
cd C:\dev\mizanly\apps\mobile

# Client-side NSFW screening (nsfwCheck.ts ready, wired into create-post)
npm install nsfwjs @tensorflow/tfjs @tensorflow/tfjs-react-native --legacy-peer-deps
# Then download MobileNetV2 model to apps/mobile/assets/model/

# Video fullscreen orientation lock (VideoPlayer.tsx has TODO)
npm install expo-screen-orientation --legacy-peer-deps

# Screenshot prevention on 2FA/encryption (useEffect TODO added)
npm install expo-screen-capture --legacy-peer-deps

# App rating prompt after 7 sessions (session counter in _layout.tsx)
npm install expo-store-review --legacy-peer-deps
```

## REMAINING WORK (verified 2026-03-23 final grep audit)

**Session 2 stats:** 10 waves, 80 agents, ~220 fixes, 4,706 tests, 965 commits. MASTER_TODO: 179 done, 13 partial, 59 open + 140 competitor features.

### 13 PARTIAL ITEMS (started, not finished)

1. **Payments** — donate/gift-shop/waqf/orders wired to Stripe. Cashout UI wired. Backend `/monetization/wallet/cashout` endpoint needs building.
2. **Video editor** — uploads original with edit metadata. Real editing needs `ffmpeg-kit-react-native`.
3. **Cashout withdrawal** — UI + requestCashout call wired. Backend endpoint TODO.
4. **Islamic audio** — dhikr/dua/names-of-allah use Audio.Sound. Still no Quran recitation audio CDN.
5. **Screenshot prevention** — code exists in 2fa-setup + verify-encryption, commented out. Needs `expo-screen-capture` install.
6. **accessibilityLabel** — 241/~250 files done. ~9 remaining.
7. **accessibilityRole** — 200/212 files done. ~12 remaining.
8. **accessibilityHint** — 11 files. Should be ~50+ complex action files.
9. **accessibilityState** — 50 files. Mostly done.
10. **TwoFactorSecret encryption** — encryptedSecret column + encrypt/decrypt methods exist. Migration of existing secrets pending.
11. **Socket notification delivery** — Redis publish exists. Gateway subscription to emit to socket rooms pending.
12. **Widget support** — widgetData.ts + plugins/widgets/app.plugin.js exist. Native widget code not compiled/tested.
13. **RTL left:/right:** — marginLeft/Right done (~429 replacements). Some left:/right: in components remain (~50 intentional skips for physical positions).

### 59 OPEN ITEMS

**Blocked on external (16 — cannot code):**
1. Apple IAP package not installed (App Store rejects coin purchases via Stripe)
2. App icon 69-byte placeholder (build will crash)
3. App splash 69-byte placeholder (build will crash)
4. Apple Developer $99/yr enrollment
5. Clerk still uses TEST keys (sk_test_)
6. Stripe still uses TEST keys
7. APP_URL still localhost:3000
8. No custom domain (api.mizanly.app)
9. No DNS configured
10. Social auth Google/Apple — needs Clerk dashboard config
11. 18 HIGH severity npm vulnerabilities
12. R2 CORS not configured on bucket
13. R2 lifecycle rules not set (temp uploads pile up)
14. Sentry source maps not configured for EAS builds
15. Resend domain not verified (emails may go to spam)
16. Metro bundler version conflict (CI mobile build fails)

**Needs package install (5 — user at terminal):**
17. react-native-shared-element — installed, no SharedElement in screens
18. react-native-maps — installed, MosqueFinder doesn't use MapView
19. expo-location — installed but LocationPicker uses hardcoded mosques
20. Lottie — no .json animation files, no LottieView
21. Green screen ML segmentation — needs TFLite model

**Schema (4 — risky migrations, defer post-launch):**
22. P1-DANGLING: 7/8 fixed (Wave 11). 1 unfixable: `VideoReply.commentId` is a polymorphic FK (points to Comment OR ReelComment based on `commentType` enum) — Prisma doesn't support polymorphic relations. Must resolve at application layer.
23. P1-FKARRAY: 3 String[] arrays should be join tables
24. P2-001: Mixed cuid/uuid strategy (94 cuid + 61 uuid) — leave as-is
25. C-02: Dual balance system (CoinBalance table + User.coinBalance coexist)

**Translations (7 — human translator needed):**
26. Urdu (ur): 14%
27. Bengali (bn): 14%
28. French (fr): 15%
29. Indonesian (id): 16%
30. Malay (ms): 15%
31. Arabic (ar): 77%
32. Turkish (tr): 89%

**Infrastructure (5 — separate projects):**
33. No landing page (mizanly.com)
34. No analytics/attribution
35. No admin dashboard web UI
36. No moderation dashboard web UI
37. No CI/CD pipeline for mobile builds

**Code-fixable, low priority (10):**
38. WebRTC calls not wired (Month 2 roadmap)
39. Call screen facade — no real audio/video
40. Old username links break (needs UsernameHistory schema model)
41. Status privacy in AsyncStorage only (needs backend persistence)
42. Mosque Finder no map (react-native-maps installed, not wired)
43. LocationPicker 100% mock (hardcoded locations)
44. Quran recitation audio missing (other Islamic audio works)
45. Small touch targets: 53 elements at 40px (below 44px WCAG minimum)
46. F20: Safety numbers weak (SHA-256 truncation, needs Signal SAS)
47. A/B testing framework for algorithm weights

**Large file decomposition (4 — refactoring, not bugs):**
48. conversation/[id].tsx — 2,429 lines
49. create-story.tsx — 1,237 lines
50. video/[id].tsx — 1,490 lines
51. search.tsx — 997 lines

**Tests (3):**
52. Ralph test batch 3 (~1,050 planned, never executed)
53. toBeDefined cleanup — 158 enhanced this session, some may remain
54. string.length assertions — mostly fixed

**Cannot fix via code (5):**
55. PostGIS for nearby content
56. CDN image variants (Cloudflare Image Resizing)
57. Virus scanning (ClamAV or cloud service)
58. AI caption generation for images
59. Meilisearch deployment (search falls back to Prisma LIKE)

### 140 COMPETITOR FEATURE REQUESTS (post-launch)

**Instagram parity (15):**
- In-app gallery grid with multi-select badges
- In-app photo filters (not opacity fakes)
- In-app camera capture in create post
- Aspect ratio controls in create flow
- Mixed-size masonry grid on Discover
- Auto-playing video thumbnails on Discover
- "View all X comments" inline preview
- Skeleton→content crossfade animation
- Like count tick-up animation
- Post view count on feed
- Seen-by list on stories (expandable)
- "Add to Story" from post detail
- Close friends star indicator on story ring
- First-time creator onboarding flow
- Brand partnership marketplace

**TikTok parity (10):**
- Camera recording with timer/speed/multi-clip
- Following/For You swipe tab gesture
- Single-tap to pause video
- Creator info slide-up on pause
- Audio waveform during recording
- Sound page with "Use this sound" CTA
- Interactive volume/speed sliders
- Proactive cache warming (pre-fetch next page)
- Anti-doom-scrolling break reminders
- Frustration detection (rapid scrolling → suggest break)

**X/Twitter parity (3):**
- Poll results bar animation
- "Show N new posts" real-time banner
- Nested/indented reply threads

**WhatsApp/Telegram parity (5):**
- Voice message speed control (1x/1.5x/2x)
- Disappearing messages timer icon on chat list
- View-once screenshot detection + notification
- Voice message transcription display
- Background music selection for stories

**YouTube parity (5):**
- Video chapter ticks on scrubber
- Video thumbnail hover/long-press preview
- PiP transition animation
- Subscription bell levels (None/Personalized/All)
- Collaborative playlists

**Islamic features (10):**
- Full Quran text verse-by-verse reading
- Tafsir comparison (multiple scholars)
- Hadith chain of narration (isnad)
- Prayer notification per-prayer customization
- Mosque community event integration
- Halal restaurant reviews with photos
- Halal food barcode scanner
- Quran verse of the day widget
- Islamic greeting auto-suggestions
- Mosque check-in social feature

**Creator tools (8):**
- Content calendar
- Audience insights (demographics, peak times)
- Hashtag performance analytics
- Business profile type (contact, hours, location)
- Verified organization badges
- Multi-admin organization accounts
- Branded content tools (partnership labels)
- Promoted/sponsored content marketplace

**Safety & moderation (8):**
- Comment spam detection (repeated text)
- Fake engagement detection (like farms)
- Content warning system (CW tags)
- Trigger warning filters (configurable)
- Soft-ban shadow mode
- Appeal status tracking timeline
- Community guidelines quiz before first post
- DSA compliance (EU Digital Services Act)

**Infrastructure & scale (7):**
- Read replica for heavy queries
- CDN edge caching for media
- Database connection pooling tuning
- Horizontal Socket.io scaling (Redis adapter done, load test needed)
- Investor metrics dashboard (DAU, MAU, retention)
- Funnel analytics (signup → first post → D7)
- Battery-aware video quality switching

**UX polish (12):**
- Colorblind-safe mode
- Cookie consent banner (web)
- Mood-based content recommendations
- Time-of-day aware feed
- Celebration moments (confetti on milestones)
- Image resize before upload
- Background app refresh for notifications
- Audio equalizer for voice posts
- Comment thread folding
- Image alt text editor on upload
- Scheduled post preview
- Draft expiry (auto-delete 30 days)

**Social & profiles (10):**
- "New posts" shake-to-refresh
- Activity status customization (Online/Away/DND)
- Cross-post between spaces
- Student/teacher mode
- Parental activity summary email
- Senior-friendly mode (large text)
- Low-data mode
- Account recovery without email (social recovery)
- Login session management (see/revoke)
- Profile verification application

**Legal/compliance (4):**
- DMCA takedown workflow
- Age verification (13+)
- Data processing agreement (DPA)
- Trust score visible on profile

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **NEVER change Prisma schema field names** — They are final
6. **NEVER use `@CurrentUser()` without `'id'`** — Always `@CurrentUser('id')`
7. **ALL FlatLists must have `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
8. **NEVER use `any` in new non-test code** — Type everything properly
9. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
10. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them
11. **NEVER suppress errors with `@ts-ignore` or `@ts-expect-error`** — fix the actual type
12. **NEVER add `as any` in non-test code** — find the correct type instead
13. **Test files (*.spec.ts) MAY use `as any` for mocks** — this is the only exception
14. **ALL design/UI work MUST use `frontend-design` and `ui-ux-pro-max` skills**
15. **NEVER use Sonnet or Haiku as subagent models** — Opus only.
16. **Tests cover the ENTIRE scope, not just fixes**
17. **ALWAYS use `useContextualHaptic`** — NEVER `useHaptic`
18. **ALWAYS use `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
19. **ALWAYS use `<ProgressiveImage>` for content images** — NEVER raw `<Image>` from expo-image
20. **ALWAYS use `formatCount()` for engagement numbers**
21. **ALWAYS use `showToast()` for mutation feedback** — NEVER bare `Alert.alert` for non-destructive feedback
22. **NEVER use `colors.dark.*` in JSX directly** — Always use `tc.*` from `useThemeColors()`
23. **NEVER use `Math.random()` for visual data**
24. **NEVER use setTimeout for fake loading**
25. **MANDATORY AUDIT BEFORE EVERY COMMIT** — After ANY code change:
    - (a) Grep-verify: count occurrences, check correct file/namespace placement
    - (b) Line-by-line code review of EVERY changed line — not just "looks right" but trace logic, check edge cases, verify FFmpeg filter syntax, confirm state→export→dep-array chain is complete
    - (c) Run `npx jest --passWithNoTests --forceExit --silent` and confirm pass count
    - (d) For i18n changes: verify key counts match across all 8 languages (`node -e` JSON parse + Object.keys count)
    - (e) For FFmpeg engine changes: verify test buildCommand matches engine buildCommand (count vFilters.push and origChain.push)
    - (f) For new state variables: verify present in EditSnapshot type + captureSnapshot + applySnapshot + export editParams + handleExport dep array
    - **NEVER commit without completing ALL applicable checks above. Session 3 found 45 bugs across 7 audit rounds — most would have been caught by this checklist.**
26. **NEVER use `sed` for i18n key injection** — Session 3 proved sed puts keys in wrong JSON nesting level. Use a Node script that parses JSON, inserts into correct namespace, and writes back.
27. **EVERY new feature needs cleanup on unmount** — useEffect return function for: Audio.Recording stop, Speech.stop, setInterval clear, socket disconnect. Session 3 found voiceover + TTS leaks.
28. **Fallback export metadata MUST mirror FFmpeg export params** — When FFmpeg is unavailable, the upload-with-metadata path must include ALL edit fields. Session 3 found 25 fields missing from fallback.

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # 79 feature modules
│   │   ├── src/common/          # ClerkAuthGuard, OptionalClerkAuthGuard, decorators, queue, email
│   │   ├── src/gateways/        # Socket.io /chat namespace (chat, calls, Quran rooms)
│   │   └── prisma/schema.prisma # 188 models, 4,080 lines
│   └── mobile/                  # React Native Expo SDK 52
│       ├── app/
│       │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar, create
│       │   └── (screens)/       # 209 screens
│       └── src/
│           ├── components/ui/   # 70 components
│           ├── hooks/           # 23 hooks
│           ├── services/        # 32 API service files
│           ├── stores/index.ts  # Zustand store
│           ├── theme/index.ts   # Design tokens
│           ├── i18n/            # 8 languages
│           └── types/           # TypeScript interfaces
```

## Tech Stack
- **Mobile:** React Native (Expo SDK 52) + TypeScript + Expo Router
- **Backend:** NestJS 10 + Prisma + Neon PostgreSQL
- **Auth:** Clerk (email, phone, Apple, Google) + svix webhooks
- **Storage:** Cloudflare R2 (presigned PUT) + Stream (video)
- **Real-time:** Socket.io `/chat` namespace (Clerk JWT auth on connect)
- **Search:** Meilisearch (not configured, falls back to Prisma LIKE) | **Cache:** Upstash Redis
- **npm NOT in shell PATH** — run all npm commands in Windows terminal

---

## Design Tokens (`apps/mobile/src/theme/index.ts`)
```ts
colors.emerald = #0A7B4F       colors.gold = #C8963E
colors.dark.bg = #0D1117       colors.dark.bgElevated = #161B22
colors.dark.bgCard = #1C2333   colors.dark.bgSheet = #21283B
colors.dark.surface = #2D3548  colors.dark.border = #30363D
colors.text.primary = #FFF     colors.text.secondary = #8B949E
colors.text.tertiary = #6E7781 colors.error = #F85149

spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
animation.spring: bouncy(D10 S400) / snappy(D12 S300) / responsive(D15 S150) / gentle(D20 S100)
```

## Component Quick Reference

### Icon — 44 valid names
```tsx
<Icon name={IconName} size={'xs'|'sm'|'md'|'lg'|'xl'|number} color={string} />
// Names: arrow-left, chevron-right/left/down, heart, heart-filled, message-circle,
// bookmark, bookmark-filled, share, repeat, image, camera, video, play, mic, phone,
// search, hash, at-sign, filter, trending-up, user, users, bell, mail, check-circle,
// send, pencil, edit, trash, x, plus, circle-plus, more-horizontal, settings, lock,
// globe, eye, eye-off, flag, volume-x, link, clock, map-pin, smile, paperclip,
// check, check-check, layers, slash, log-out, bar-chart-2, loader
```

### Key Hooks
```tsx
useContextualHaptic()   // 10 semantic haptics: like, follow, save, navigate, tick, delete, error, longPress, send, success
useThemeColors()        // Returns tc.bg, tc.text.primary, tc.emerald, etc. — USE THIS for all JSX colors
useStaggeredEntrance(index)  // Stagger fade+slide for list items (40ms between items)
useScrollLinkedHeader()      // Elastic header collapse + blur on scroll
useAnimatedIcon()            // Icon animations: bounce, shake, pulse, spin
useTranslation()             // Returns { t } for i18n — t('key')
useNetworkStatus()           // Online/offline detection
useReducedMotion()           // Accessibility: motion preferences
```

### Key Components
```tsx
<Avatar uri={string|null} name={string} size={'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'} showOnline={bool} showStoryRing={bool} />
<BottomSheet visible={bool} onClose={fn}><BottomSheetItem label="..." icon={<Icon />} onPress={fn} /></BottomSheet>
<Skeleton.PostCard /> <Skeleton.ThreadCard /> <Skeleton.Circle size={40} /> <Skeleton.Rect width={120} height={14} />
<EmptyState icon="users" title="..." subtitle="..." actionLabel="..." onAction={fn} />
<CharCountRing current={n} max={500} size={28} />
<ProgressiveImage uri={url} width={w} height={h} borderRadius={r} />
<BrandedRefreshControl refreshing={bool} onRefresh={fn} />
<RichText content={string} />  // parses #hashtag and @mention
```

---

## API Patterns
- Base: `/api/v1/` | Auth: `Authorization: Bearer <clerk_jwt>`
- Pagination: `?cursor=<id>` → `{ data: T[], meta: { cursor?, hasMore } }`
- Global throttle: 100 req/min | Per-endpoint: 5-60/min depending on cost
- All responses: `{ data: T, success: true, timestamp }` via TransformInterceptor
- Socket.io: `import { SOCKET_URL } from '@/services/api'` → `io(SOCKET_URL, { auth: { token }, transports: ['websocket'] })`

## Critical Schema Field Names
- ALL models: `userId` (NOT authorId) | `user` relation (NOT `author`)
- Post: `content` (NOT caption) | `postType` | `mediaUrls[]` + `mediaTypes[]`
- Thread: `isChainHead` (NOT replyToId) | replies → `ThreadReply` model
- Conversation: `isGroup: boolean` + `groupName?` — NO `type` or `name`
- Message: `messageType` (NOT type) | `senderId` (NOT from) — optional (SetNull on user delete)
- Notification: `userId` (NOT recipientId) | `isRead` (NOT read)
- Follow: composite PK [followerId, followingId]
- Exceptions: ForumThread/ForumReply use `authorId`, Circle/MajlisList use `ownerId`, GiftRecord uses `senderId`/`receiverId`
- ID strategy: core models use `@default(cuid())`, extensions use `@default(uuid())`. New models should use `cuid()` for consistency.

## Zustand Store
```ts
unreadNotifications / setUnreadNotifications(n)
unreadMessages / setUnreadMessages(n)
safFeedType: 'following'|'foryou'
majlisFeedType: 'foryou'|'following'|'trending'
isCreateSheetOpen / setCreateSheetOpen(bool)
theme: 'dark'|'light'|'system' / setTheme
```

## Development Commands
```bash
# All npm must run in Windows terminal (not shell — npm not in PATH)
cd apps/api && npm install --legacy-peer-deps && npm run start:dev   # Swagger: http://localhost:3000/docs
cd apps/mobile && npm install --legacy-peer-deps && npx expo start
cd apps/api && npx prisma db push                 # Dev only — use prisma migrate deploy for production
cd apps/api && npx prisma studio                  # DB browser GUI
cd apps/api && npx prisma db seed                 # Seed dev data (3 users, 5 posts, 3 threads)
```

## Font Family Names
```ts
fonts.headingBold = 'PlayfairDisplay_700Bold'
fonts.body = 'DMSans_400Regular'
fonts.bodyMedium = 'DMSans_500Medium'
fonts.bodyBold = 'DMSans_700Bold'
fonts.arabic = 'NotoNaskhArabic_400Regular'
fonts.arabicBold = 'NotoNaskhArabic_700Bold'
```

## i18n
- **Languages:** en, ar, tr, ur, bn, fr, id, ms (8 total)
- **Keys:** 3,173+ per language, 103 accessibility keys, all at 100% structural parity
- **Translation status:** en 100%, tr 89%, ar 77%, ur/bn/fr/id/ms 14-16% (needs human translator)
- **All new screens MUST have i18n keys in ALL 8 language files**

## Create Sheet Options (7 items)
Post | Thread | Story | Reel | Long Video | Go Live | Voice Post

## Settings Sections
Content | Appearance | Privacy | Notifications | Wellbeing | Islamic | Accessibility | Close Friends | AI | Creator | Community | Gamification | Account | About
