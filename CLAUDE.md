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

## Current State (as of 2026-03-24)

**Backend:** NestJS 10, 79 modules, 82 controllers, 86 services, 193 Prisma models, 55 enums (4,700+ lines). 289 test suites, 4,876 tests, 100% pass, 0 TypeScript errors. Server starts clean.
**Mobile:** React Native Expo SDK 52, 212 screens, 76 components, 23 hooks, 33 API services. 0 mobile TypeScript errors. 210/212 screens accessible.
**i18n:** 8 languages (en, ar, tr, ur, bn, fr, id, ms), 3,500+ keys each, ~400 keys added in session 2.
**Real-time:** Socket.io on 4 screens (chat, calls, Quran rooms, conversation list) with Clerk JWT auth, reconnection, token refresh. Redis pub/sub for notification delivery to socket rooms.
**Algorithm:** 3-stage ranking (pgvector KNN → weighted scoring → diversity reranking), k-means multi-cluster interest vectors (2-3 centroids), 15% exploration slots, hashtag diversity reranking, Islamic boost location-aware via prayer-calculator, session signals in Redis, trending 24h window with 12h decay, HNSW vector index, cursor-based keyset pagination.
**Payments:** Stripe PaymentIntent wired on donate, gift-shop, waqf, orders, send-tip. 4 cashout wallet endpoints (balance, payment-methods, cashout, payout-history). Apple IAP not installed.
**All credentials configured** (32/34 — only Meilisearch + APP_URL production). R2, Cloudflare Stream, Sentry, Resend, Stripe, TURN, Gemini, Whisper, Claude, GIPHY all SET.
**GIPHY SDK:** Beta key active (100 searches/hr). Production key requires app demo + approval — apply before launch when screens are ready. SDK gives GIF search + GIPHY Text (animated text stickers) + Stickers + Clips.
**Schema:** 55 Prisma enums (all 41 String→Enum complete). 7/8 dangling FK relations fixed (1 unfixable — polymorphic). StarredMessage + WaqfDonation + VideoCommentLike + ScholarQuestionVote + HalalVerifyVote join tables. 25+ indexes. previousUsername for redirect. Privacy settings server-side. TOTP encryption + backup salt fields.
**RTL:** Complete — ~430 margin/padding/position replacements across 134 files.
**Security:** Pre-save moderation on all content types, AI prompt XML hardening, device fingerprint (5/device), nsfwjs client-side service ready, file size limits on uploads.
**Video Editor:** FFmpeg-kit full-gpl. **10 tool tabs** (trim, speed, filters, adjust, text, music, volume, effects, voiceover + quick actions bar). 35 edit state fields tracked in undo/redo. 118 FFmpeg engine tests + 10 concat tests. See "Session 3 — What Was Built" below for complete feature list.
**Packages installed (session 3):** ffmpeg-kit-react-native 6.0.2 (full-gpl via Expo config plugin), expo-screen-orientation, expo-screen-capture, expo-store-review, expo-speech, nsfwjs + @tensorflow/tfjs + @tensorflow/tfjs-react-native.
**Database synced** — `prisma db push` confirmed in sync. Production uses `prisma migrate deploy`.
**CI/CD:** GitHub Actions — lint-typecheck PASS, test-api PASS, build-api PASS. build-mobile needs `npm install --legacy-peer-deps` (metro removed from root, vuln overrides added).
**~1030 commits**, 11 waves in session 2 + 29 commits in session 3.

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

## SESSION 4 CHECKLIST — Creation Flow & Interactive Features

### Interactive Story Stickers (Instagram parity — HIGH PRIORITY)
- [ ] Poll sticker (binary/multi-option, real-time results)
- [ ] Quiz sticker (multiple choice with correct answer reveal)
- [ ] Question box sticker (open text, reshare answers)
- [ ] Countdown sticker (timer to date, follower opt-in)
- [ ] Emoji slider sticker (sliding scale with custom emoji)
- [ ] Location sticker on stories (searchable, tappable)
- [ ] Link sticker (external URL, available to all)
- [ ] "Add Yours" chain sticker (viewers add their own response)
- [ ] GIF search sticker (GIPHY integration)
- [ ] Music sticker on stories (song clip with lyric display)

### Publish Screen Fields (Table stakes)
- [ ] Location tag on post/reel publish
- [ ] Tag people in post
- [ ] Invite collaborator (co-author, reel on both profiles)
- [ ] Topics/categories selector for reels
- [ ] Schedule posting (date/time picker)
- [ ] Alt text for accessibility
- [ ] Remix settings (allow/disallow)
- [ ] Who can comment selector
- [ ] Share to feed toggle
- [ ] Branded content / paid partnership label
- [ ] Trial reel (test with non-followers, auto-share if performs well)

### Photo Carousel Posts (TikTok/Instagram)
- [ ] Multi-photo upload (up to 10-35 slides)
- [ ] Music attachment on carousel
- [ ] Per-slide text overlay
- [ ] Swipe navigation
- [ ] Drag-to-reorder

### Story Drawing Tools (Instagram/Snapchat parity)
- [ ] Freehand pen (color picker + size)
- [ ] Highlighter pen
- [ ] Neon glow pen
- [ ] Eraser
- [ ] Eyedropper (pick color from image)

### "2026 Wow" Features
- [ ] AI stickers (type text → generate image via Claude/Gemini)
- [ ] AI backdrop (text prompt → background replacement)
- [ ] Auto-captions with word emphasis styling
- [ ] Thumbnail A/B testing (for Minbar videos)
- [ ] Custom sticker creation (cut out from photo)

### Non-Editor Priorities (Deferred from Session 3)
- [ ] WebRTC calls wiring (~500 lines, TURN ready)
- [ ] Wire react-native-maps into MosqueFinder
- [ ] Wire expo-location into LocationPicker
- [ ] Performance sweep (React.memo, FlashList, prefetching)
- [ ] Quran recitation audio CDN

## Key Documentation
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

## LAUNCH ROADMAP

### Week 1: Launch Blockers
- [ ] App icon + splash (replace 69-byte placeholders) — designer or Canva
- [ ] Apple Developer enrollment ($99, 48h)
- [ ] Clerk production keys (switch sk_test_ → sk_live_)
- [ ] Stripe live keys
- [ ] APP_URL → production URL (currently localhost:3000)
- [ ] Custom domain (api.mizanly.app) — Cloudflare + Railway
- [ ] Fix metro CI build (remove root metro dep)
- [ ] First EAS build (iOS + Android)

### Week 2: Test With Real Data
- [ ] Upload real images/videos (verify R2 presigned URLs)
- [ ] Send real push notifications (verify FCM + APNs)
- [ ] Process $1 test payment (verify Stripe end-to-end)
- [ ] Real-time messaging (two devices, real conversation)
- [ ] Deploy to Railway + verify health endpoint

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
