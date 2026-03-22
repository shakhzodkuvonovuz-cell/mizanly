# Mizanly — The 10/10 Plan: Two Mega Batches
## Date: 2026-03-20 | Honest Assessment: Current = 5/10 | Target = 10/10

> **Why 5/10 and not 10/10?** Features EXIST but lack DEPTH. Having a video-editor.tsx screen is not the same as having a video editor. Having a feed service is not the same as having an algorithm. Having 196 screens means nothing if the feed is empty for new users and push notifications don't work. This plan is brutally honest about what "10/10" actually requires.

---

# BATCH 1: "FOUNDATION TO FLAWLESS"
## Make everything that EXISTS work at 10/10 quality

**Philosophy:** Zero new features. Just make every existing feature as good as the competitor equivalent. Depth over breadth. Polish over quantity. A user who opens the app should feel "this is as smooth as Instagram" not "this is a student project with lots of screens."

**Estimated effort:** 4-6 weeks of focused work
**Goal:** Go from 5/10 to 7.5/10

---

## 1.1 — LAUNCH BLOCKERS (P0 — Nothing else matters without these)

### 1.1.1 Push Notifications (FCM + APNs)
**Current state:** Expo Push API code exists but FCM/APNs delivery is NOT configured. The app cannot send real push notifications to devices.
**Why this is P0:** Without push notifications, users will never return to the app. Every successful social app's #1 retention mechanism is push. "X liked your photo", "You have 3 new messages", "Don't lose your streak!" — these are what bring users back.
**What needs to happen:**
- Install `expo-notifications` in `apps/mobile` (must be done in Windows terminal since npm not in PATH)
- Install `firebase-admin` in `apps/api`
- Configure Firebase Cloud Messaging (FCM) for Android
- Configure APNs certificates for iOS (requires Apple Developer account — currently blocked on $99 enrollment)
- Create `push.service.ts` enhancement: store device tokens per user, handle token refresh
- Wire push triggers for ALL notification types:
  - New follower
  - Post liked/commented/shared
  - New message (DM, group)
  - Story mention
  - Thread reply
  - Live started by someone you follow
  - Streak about to expire
  - Prayer time reminders (from Islamic module)
  - "Your post got X views" (creator vanity metric)
  - "X people from your community joined" (social proof)
- Handle notification tap → deep link to correct screen
- Handle background vs foreground notification display
- Notification grouping (collapse 10 likes into "10 people liked your post")
- Notification channels on Android (separate channels for messages, social, Islamic, etc.)
- Silent notifications for badge count updates
**Acceptance criteria:** User receives a real push notification on their physical device when someone sends them a message or likes their post. Tapping the notification opens the correct screen.

### 1.1.2 Fix Empty Feed for New Users
**Current state:** A new user who creates an account and doesn't follow anyone sees an empty feed. They will uninstall within 30 seconds.
**Why this is P0:** The first 30 seconds determine if a user stays. Instagram shows suggested content. TikTok shows trending videos. Mizanly shows... nothing.
**What needs to happen:**
- **Trending/curated feed for zero-follow users:** When a user has 0 follows, the Saf feed should show trending posts, staff picks, and popular content from the last 7 days
- **"For You" tab must work without follows:** Currently `safFeedType: 'foryou'` likely returns empty results for new users. It should fall back to globally trending content scored by engagement rate
- **Bakra (reels) must autoplay immediately:** Even without follows, show trending/popular reels. TikTok works for users who follow ZERO people — Bakra must too
- **Majlis trending tab must populate:** Trending threads should be visible to everyone, not just users who follow thread authors
- **Interest-based seeding:** The onboarding interest selection screen exists — wire it to actually influence what content appears. If user selects "Islamic History", their feed should prioritize posts tagged with that topic
- **"Suggested for you" cards in feed:** Interleave follow suggestions between posts (every 5-10 posts, show "People you might like" card with follow buttons)
- **Editorial/staff picks system:** Backend endpoint for admins to "pin" or "feature" high-quality content that all new users see
**Acceptance criteria:** A brand new user with 0 follows opens the app and immediately sees engaging content in Saf, Bakra, and Majlis. They can scroll for 5+ minutes without running out of content.

### 1.1.3 Anonymous Browsing Mode
**Current state:** Users MUST create an account to see ANY content. This is a massive friction barrier.
**Why this is P0:** TikTok's #1 growth lever is that you can browse without signing up. 60%+ of TikTok's initial users browsed anonymously before creating an account. Mizanly locks everything behind auth.
**What needs to happen:**
- **OptionalClerkAuthGuard already exists** — extend it to more routes (feed, reels, threads, profiles)
- Create an "anonymous session" flow: user opens app → sees content immediately → auth gate only when they try to interact (like, comment, follow, message)
- Track anonymous session behavior (views, watch time, scroll patterns) for future algorithm personalization
- Show gentle "Sign up to like this" prompts on interaction attempts
- Store anonymous preferences in AsyncStorage → transfer to account on sign-up
- Deep links from shared content (someone shares a reel link → opens in-app without auth required)
**Acceptance criteria:** A user who has never signed up can download the app, open it, and browse Saf, Bakra, and Majlis feeds for as long as they want. Auth gate appears only when they try to interact.

### 1.1.4 Fix Test Suite Health
**Current state:** 161 failing tests across 36 suites. 788/949 passing (83%). Many failures are from mock gaps after constructor changes.
**Why this is P0:** You cannot safely deploy or refactor code when 17% of tests are broken. Broken tests mean broken CI/CD, which means broken confidence in deployments.
**What needs to happen:**
- Audit all 36 failing suites — categorize failures:
  - Mock signature mismatches (constructor changes not reflected in test mocks)
  - Missing provider injections in test modules
  - Stale test data assumptions
  - Actually broken logic (real bugs hidden by failing tests)
- Fix every failing test — properly mock dependencies, update constructors, fix assertions
- Add tests for 18 services that have NO test file at all
- Target: 95%+ pass rate (900+/949)
- Set up pre-commit hook that runs tests (prevents regression)
**Acceptance criteria:** `npm test` in `apps/api` runs with 0 failures. All 96+ test files pass.

### 1.1.5 Apple Developer Enrollment
**Current state:** Blocked on $99/year Apple Developer Program enrollment. Cannot build or distribute iOS app.
**What needs to happen:**
- Complete Apple Developer enrollment for shakhzodkuvonov.uz@gmail.com
- Wait for approval (up to 48 hours)
- Run `npx eas-cli build --profile preview --platform ios` from `apps/mobile`
- Test on physical iOS device via TestFlight
- Configure APNs certificates for push notifications
**Acceptance criteria:** Working iOS build on TestFlight that can be installed on a real iPhone.

---

## 1.2 — PERFORMANCE & INFRASTRUCTURE (Make it FAST)

### 1.2.1 Video Preloading in Bakra (Reels)
**Current state:** Each reel loads only when swiped to. This causes a visible loading stutter between reels — the #1 UX complaint on any TikTok clone.
**Why critical:** TikTok preloads the next 2-3 videos while you watch the current one. The transition between videos is instantaneous. Bakra's stutter makes it feel amateur.
**What needs to happen:**
- Implement a preloading manager that fetches the next 2 videos while the current one plays
- Use `expo-av` preloading: create Video components for next 2 items, start loading but don't play
- Cache video metadata (duration, thumbnail, creator info) for next 5 items
- Recycle video players: maintain a pool of 3 Video components, rotate them as user swipes
- Add loading skeleton that matches TikTok's pattern (blurred thumbnail → sharp video)
- Memory management: unload videos that are 3+ positions behind current
**Acceptance criteria:** Swiping between reels in Bakra has zero loading delay. Next video starts playing instantly (<200ms).

### 1.2.2 Progressive Image Loading
**Current state:** Images go from blank → fully loaded. No transition, no placeholder. Feels janky.
**Why critical:** Instagram uses progressive loading (blurred placeholder → sharp image). It makes the feed feel fast even on slow connections.
**What needs to happen:**
- Generate BlurHash or ThumbHash for every uploaded image (backend: generate on upload, store hash in Post model)
- Add `blurhash` field to Post, Story, User (avatar/cover) models in Prisma schema
- Frontend: render BlurHash placeholder immediately, crossfade to full image on load
- Use `expo-image` (successor to FastImage) which has built-in BlurHash support
- Apply to: Saf feed images, Story thumbnails, Profile avatars, Bakra thumbnails, Minbar thumbnails
- Fallback: if no BlurHash exists (old content), use a themed skeleton placeholder
**Acceptance criteria:** Every image in the app shows a colored blur placeholder before the full image loads. Transition is smooth crossfade, not a pop-in.

### 1.2.3 Offline Support (Basic)
**Current state:** App is 100% useless without internet. Zero caching. Even your own profile doesn't load offline.
**Why critical:** Users in many Muslim-majority countries have unreliable internet (parts of Pakistan, Bangladesh, Indonesia, West Africa). The app should degrade gracefully, not crash.
**What needs to happen:**
- **Text caching:** Cache feed data, conversation list, and profile in AsyncStorage/MMKV
- **Image caching:** `expo-image` has built-in disk caching — configure cache limits (500MB)
- **Offline indicator:** Show "You're offline" banner at top (not a full-screen error)
- **Queue offline actions:** If user likes/comments while offline, queue the action and sync when back online
- **Stale-while-revalidate pattern:** Show cached data immediately, fetch fresh data in background
- **Conversation cache:** Cache last 50 messages per conversation for offline reading
- **Prayer times cache:** Prayer times for current location should work offline (calculate locally, don't depend on API)
**Acceptance criteria:** User can open the app with no internet and see their feed (last cached version), read cached messages, and see prayer times. A banner shows "Offline" but the app doesn't crash or show empty screens.

### 1.2.4 CDN & Media Optimization
**Current state:** Cloudflare R2 serves media but no cache headers, no image optimization, no responsive images.
**What needs to happen:**
- Set `Cache-Control: public, max-age=31536000, immutable` on all uploaded media (images/videos are immutable — URL changes when content changes)
- Implement image resizing on upload: generate 3 sizes (thumbnail 200px, medium 600px, full 1200px)
- Serve appropriate size based on context (feed thumbnail vs full-screen view vs avatar)
- Enable Cloudflare Polish (automatic WebP conversion) if available on R2
- Set ETag headers for conditional requests
- Implement `stale-while-revalidate` for API responses
- Configure Cloudflare Stream for adaptive bitrate delivery (HLS)
**Acceptance criteria:** Lighthouse audit shows all images served in next-gen formats (WebP/AVIF), proper cache headers, and responsive sizing. Media loads 50%+ faster on repeat visits.

### 1.2.5 Bundle Size & Code Splitting
**Current state:** Full app bundle includes all 196 screens. No lazy loading, no code splitting. Startup time suffers.
**What needs to happen:**
- Implement Expo Router's lazy loading for screen groups: each space (Saf, Bakra, Majlis, Risalah, Minbar) loads its screens on demand
- Tree-shake unused imports across the app
- Audit and remove unused npm dependencies
- Compress assets (images, JSON data files)
- Measure and track bundle size per space
- Hermes engine: verify it's enabled and optimized (bytecode precompilation)
- Target: <15MB initial bundle (currently likely 30MB+)
**Acceptance criteria:** App cold start time is under 2 seconds on a mid-range device. Screen transitions to unvisited spaces don't show blank screens while loading.

### 1.2.6 API Response Time Optimization
**Current state:** No evidence of query optimization, no connection pool tuning, single-region deployment.
**What needs to happen:**
- Add Prisma query logging in dev mode to identify slow queries (>100ms)
- Add `select` clauses to all Prisma queries — stop fetching full models when you only need id + name
- Connection pool tuning: configure Neon's pool size for concurrent connections
- Redis caching layer for hot data: trending posts, popular users, prayer times
- Consider read replicas for heavy queries (feed generation, recommendations)
- Add response time headers (`X-Response-Time`) for monitoring
- Database query analysis: run `EXPLAIN ANALYZE` on feed and recommendation queries
- N+1 query detection: audit services for loops that make individual DB calls
**Acceptance criteria:** 95th percentile API response time is under 200ms for feed endpoints, under 100ms for cached data.

### 1.2.7 Multi-Region Deployment
**Current state:** Single Railway instance in one region. A user in Jakarta (Indonesia, 270M Muslims) gets 300ms+ latency.
**What needs to happen:**
- Deploy API to at least 3 regions: US East, Europe (for Turkey/MENA), Asia (for Indonesia/Malaysia/Bangladesh)
- Configure Railway or Fly.io multi-region deployment
- Use Neon's read replicas per region
- Upstash Redis is already global (verify correct region configuration)
- Cloudflare R2 is already global CDN
- Consider edge functions for latency-critical endpoints (feed, messages)
**Acceptance criteria:** API latency under 100ms for users in all major Muslim population centers (MENA, South Asia, Southeast Asia, Western Europe, North America).

### 1.2.8 Background Job Queue
**Current state:** No job queue. Everything is synchronous — push notifications, email, analytics, media processing all block the request.
**What needs to happen:**
- Install BullMQ with Upstash Redis as backend
- Move these to background jobs:
  - Push notification delivery
  - Email sending
  - Image resize/BlurHash generation
  - Video transcription (Whisper)
  - Feed score recalculation
  - Analytics aggregation
  - Webhook delivery
  - Search index updates (Meilisearch)
  - AI content moderation
- Add job dashboard (Bull Board) for monitoring
- Implement retry logic with exponential backoff
- Dead letter queue for permanently failed jobs
**Acceptance criteria:** No API endpoint takes longer than 500ms because of background work. All async operations (notifications, email, media processing) happen via job queue with retry logic.

---

## 1.3 — UX/UI POLISH (Make it FEEL like $100B)

### 1.3.1 Gesture-Driven Navigation
**Current state:** Everything is button-press. No swipe gestures for navigation. Feels like a web app wrapped in React Native.
**What needs to happen:**
- Swipe between spaces: swipe left/right on feed to switch between Saf/Bakra/Majlis (like Instagram switching between Feed/Reels/Shop)
- Swipe-to-go-back on every screen (React Navigation default, but verify it works on all 196 screens)
- Long-press on tab bar icons for quick actions (long-press Risalah → new message, long-press Saf → new post)
- Pull-down-to-create gesture on camera screen
- Pinch-to-zoom on all images (ImageLightbox exists — verify it's used everywhere)
- Double-tap to like on all content types (Saf posts, Bakra reels, Majlis threads)
**Acceptance criteria:** Core navigation feels gesture-driven, not button-driven. User can navigate the app with minimal button presses.

### 1.3.2 Header/Tab Hide on Scroll
**Current state:** Headers and tab bars are permanently visible, taking up screen real estate. Content doesn't feel immersive.
**What needs to happen:**
- Implement scroll-aware header: hide on scroll down, reveal on scroll up (Instagram pattern)
- Apply to: Saf feed, Bakra reels, Majlis threads, Minbar videos
- Tab bar should also hide on scroll down in feed views
- Use `Animated.diffClamp` for smooth hide/reveal (not abrupt show/hide)
- Respect "tap status bar to scroll to top" iOS convention
- Keep header visible on non-scrollable screens (settings, profile, etc.)
**Acceptance criteria:** Scrolling down in any feed view smoothly hides the header and tab bar, giving full-screen content view. Scrolling up reveals them.

### 1.3.3 Shared Element Transitions
**Current state:** Screen transitions are basic push/pop. No visual connection between screens (e.g., tapping a post thumbnail doesn't morph into the full post view).
**What needs to happen:**
- Post thumbnail → full post: the image morphs from feed size to full-screen
- Profile avatar → full profile: avatar in feed morphs to profile header
- Story bubble → story viewer: the circle morphs into full-screen story
- Reel thumbnail → reel player: thumbnail expands to full-screen video
- Use `react-native-shared-element` or Expo Router's experimental shared transitions
- Fallback: if shared element transition isn't smooth, use a fast crossfade instead of the default slide
**Acceptance criteria:** At least 3 key transitions (post→detail, avatar→profile, story→viewer) use shared element animation that feels native.

### 1.3.4 Micro-Interactions & Haptics
**Current state:** `useAnimatedPress` provides scale animation on press. `useHaptic` hook exists. But most interactions lack the satisfying micro-feedback that Instagram/TikTok have.
**What needs to happen:**
- **Double-tap heart burst:** When double-tapping a post to like, show a particle burst animation (hearts flying out, scale bounce, brief glow) — not just a scale change
- **Like button animation:** Heart icon should fill with a spring animation + color change (empty→filled, with bounce overshoot)
- **Pull-to-refresh:** Custom animated refresh indicator (Mizanly logo spinning, or emerald pulse) instead of default RefreshControl
- **Tab switch haptic:** Light haptic feedback when switching tabs
- **Send message haptic:** Medium haptic on message send
- **Story progress bar:** Smooth progress animation per story segment
- **Skeleton shimmer:** Skeletons should have a shimmer/wave animation (left-to-right gradient sweep), not static gray boxes
- **Toast notifications:** Slide-down toast for "Liked", "Saved", "Copied" with spring animation
- **Swipe-to-reply haptic:** Haptic at the trigger threshold when swiping to reply in Risalah
- **Bookmark animation:** Bookmark icon should "catch" with a satisfying bounce
**Acceptance criteria:** Every primary interaction (like, save, share, send, follow) has both visual animation and haptic feedback. The app feels tactile and responsive.

### 1.3.5 Story Viewer Polish
**Current state:** Story viewer exists but likely lacks the smooth cube/slide transition between stories that Instagram has.
**What needs to happen:**
- Cube transition between users' stories (3D rotation effect as you swipe between story sets)
- Smooth progress bar at top (auto-advancing, pausable on press-and-hold)
- Tap left side = previous, tap right side = next, swipe down = close
- Reply bar at bottom with text input + emoji + reaction quick-send
- Story viewer loading: show BlurHash of story content while full media loads
- Gesture to swipe up for links/actions attached to story
- Close animation: story shrinks back to the story bubble position
**Acceptance criteria:** Story viewing experience is visually identical to Instagram Stories in terms of transitions, gestures, and animations.

### 1.3.6 Consistent Screen Density & Spacing Audit
**Current state:** 196 screens with inconsistent density — some feel spacious, others cramped. No systematic spacing audit.
**What needs to happen:**
- Audit all 196 screens against the design token system (spacing.xs=4, sm=8, md=12, base=16, lg=20, xl=24, 2xl=32)
- Ensure consistent padding: all screen content uses `spacing.base` (16) horizontal padding
- Ensure consistent section spacing: sections separated by `spacing.xl` (24) or `spacing.2xl` (32)
- Ensure consistent list item height: minimum 48px for touch targets
- Fix any screens where content touches screen edges without padding
- Fix any screens where spacing feels inconsistent with adjacent screens
- Ensure all headers have consistent height and content alignment
**Acceptance criteria:** Every screen feels like it belongs to the same app. Spacing is consistent and deliberate.

### 1.3.7 Empty State & Error State Completeness
**Current state:** EmptyState component exists but may not be used on every screen that can be empty. Error states may show raw error messages or nothing.
**What needs to happen:**
- Audit every screen/list that can be empty → ensure EmptyState component with icon, title, subtitle, and action button
- Audit every API call → ensure error states are caught and shown with meaningful messages (not "Error" or stack traces)
- Network error state: "No internet connection" with retry button
- Auth error state: "Session expired, please sign in again" with sign-in button
- Rate limit state: "Too many requests, please try again in X seconds"
- Server error state: "Something went wrong" with retry button
- Permission denied state: "You don't have access to this" with explanation
- Every error state should use the EmptyState component or a dedicated error component — never a bare Text
**Acceptance criteria:** No screen in the app can ever show a blank white/dark screen, a raw error message, or an unhandled error state.

### 1.3.8 Ambient Mode for Minbar (Video Player)
**Current state:** Video player has a static dark background. No visual connection between the video content and the surrounding UI.
**What needs to happen:**
- Extract dominant color from video thumbnail
- Apply as subtle gradient background behind the video player (like YouTube's ambient mode)
- Transition smoothly when switching between videos
- Apply to both Minbar (long video) and Bakra (reels) players
- Respect performance: don't extract colors on every frame, just on video load
**Acceptance criteria:** When watching a video, the background subtly reflects the video's color palette, creating an immersive viewing experience.

---

## 1.4 — ALGORITHM & DISCOVERY (Make the feed SMART)

### 1.4.1 Multi-Stage Feed Ranking Pipeline
**Current state:** `feed.service.ts` uses handcrafted SQL weights (liked: 2, commented: 3, shared: 4, saved: 3). This is a calculator, not an algorithm.
**What needs to happen:**
- **Stage 1 — Candidate Generation:** Use Gemini text-embedding-004 + pgvector to find semantically similar content to what the user has engaged with. Generate 500 candidates per feed refresh.
- **Stage 2 — Scoring:** Score each candidate using behavioral signals:
  - Completion rate (most important — if they watched 90% of a reel, that's a strong signal)
  - Shares/saves (stronger signal than likes — indicates genuine value)
  - Comment depth (replies to comments > top-level comments > likes)
  - Recency decay (exponential time decay, content >7 days gets heavily penalized)
  - Creator relationship (content from people you DM > people you follow > strangers)
  - Content type preference (if user watches 80% reels and 20% posts, weight accordingly)
- **Stage 3 — Reranking:** Apply diversity injection:
  - No more than 3 consecutive posts from the same creator
  - Mix content types (post, reel, thread) — don't show 10 reels in a row
  - Inject discovery content (10-20% from creators user doesn't follow)
  - Islamic content boost during prayer times, Fridays, Ramadan
- **Stage 4 — Explain:** Store the reason for each recommendation (for `why-showing.tsx` transparency)
**Acceptance criteria:** Feed feels personalized after 30 minutes of usage. Content improves as user engages. Feed transparency screen shows real reasons, not generic text.

### 1.4.2 Content Understanding via AI
**Current state:** No content analysis. Posts are ranked purely on engagement signals, not on what the content IS about.
**What needs to happen:**
- **Image classification:** Use Claude Vision API to generate tags for uploaded images (e.g., "mosque", "food", "nature", "family", "calligraphy")
- **Video transcription:** Use Whisper API to transcribe video audio → extract topics and keywords
- **Text classification:** Use Claude API to classify post text into categories (fiqh, seerah, dawah, lifestyle, humor, news, etc.)
- **Store embeddings:** Generate text embeddings for all content → store in pgvector
- **Build interest profiles:** Aggregate user's engagement by content category → build interest vector
- **Similar content discovery:** "If you liked this Quran recitation video, here are 5 more"
**Acceptance criteria:** The system understands what content is ABOUT, not just how popular it is. A user who engages with cooking content sees more cooking content.

### 1.4.3 Cold Start Solution
**Current state:** New users with no follows get nothing. No personalization until they manually follow people.
**What needs to happen:**
- **Anonymous behavior tracking:** Track views, scroll speed, pause duration, shares even before account creation
- **Interest selection → algorithm seeding:** Onboarding interests MUST feed directly into the recommendation engine. If user selects "Islamic History", immediately boost seerah content.
- **Trending/editorial feed:** Maintain a real-time trending feed (scored by engagement rate, not total engagement — prevents old viral posts from dominating)
- **Demographic seeding:** If user's language is Arabic, seed with Arabic-language content. If Turkish, seed with Turkish content.
- **Progressive personalization:** After 10 interactions, start weighting personal signals. After 50, personal signals dominate. After 200, fully personalized.
**Acceptance criteria:** A new user sees relevant, engaging content within their first 5 minutes. By day 3, their feed feels personalized.

### 1.4.4 Session-Aware Real-Time Adaptation
**Current state:** Feed is generated once per refresh. No adaptation during a browsing session.
**What needs to happen:**
- Track in-session signals: "User just watched 3 cooking reels in a row"
- Dynamically adjust next recommendations based on session behavior (not just historical behavior)
- If user is skipping content fast → inject higher-quality/trending content
- If user is deeply engaging (comments, shares) → show more from that topic/creator
- Time-of-day awareness: morning = news/inspiration, evening = entertainment/relaxation, prayer time = Islamic content
**Acceptance criteria:** The feed adapts within a single browsing session. If user watches 3 cooking videos, the 4th recommended video is cooking-related.

---

## 1.5 — SECURITY & PRIVACY HARDENING

### 1.5.1 End-to-End Encryption Depth
**Current state:** `encryption.service.ts` exists at 188 lines. This is likely a basic wrapper, not a full Signal Protocol implementation.
**What needs to happen:**
- Evaluate current encryption implementation — is it actually encrypting message content, or just providing utilities?
- If incomplete: implement proper E2E encryption for Risalah DMs using a proven library (libsignal or tweetnacl)
- Key exchange: Diffie-Hellman key agreement on conversation start
- Message encryption: AES-256-GCM per message with unique nonces
- Key rotation: new keys per session or per N messages
- Verify-encryption screen must show actual safety numbers (fingerprint comparison)
- Server should never see plaintext message content
**Acceptance criteria:** DM messages are encrypted client-side before sending. Server stores ciphertext only. Users can verify encryption via safety numbers.

### 1.5.2 GDPR/CCPA Compliance
**Current state:** No data export, no right-to-deletion, no consent management.
**What needs to happen:**
- **Data export endpoint:** `GET /api/v1/users/me/data-export` → generates ZIP with all user data (posts, messages, profile, settings) in JSON format
- Wire to `manage-data.tsx` screen (already exists)
- **Right to deletion:** `DELETE /api/v1/users/me` → cascading soft-delete of all user data (30-day grace period, then hard delete)
- **Consent management:** Track which data processing consents the user has given
- **Cookie consent:** If web version exists, cookie consent banner
- **Privacy policy:** Actual privacy policy page (required for App Store)
- **Data retention policy:** Auto-delete old stories (24h), old notifications (30 days), old analytics (90 days)
**Acceptance criteria:** User can export all their data as a ZIP file and request full account deletion. Privacy policy is accessible from settings.

### 1.5.3 Device Management & Login Security
**Current state:** No way to see where you're logged in or log out remotely.
**What needs to happen:**
- Store active sessions per user: device type, OS, location (IP-based), last active timestamp
- `GET /api/v1/users/me/sessions` → list all active sessions
- `DELETE /api/v1/users/me/sessions/:id` → remotely log out a specific device
- "New login from [City]" push notification when a new device logs in
- Suspicious login detection: if login from a new country, require 2FA
- Session timeout: inactive sessions expire after 30 days
**Acceptance criteria:** User can see all devices where they're logged in and remotely log out any of them.

### 1.5.4 Rate Limiting Per-User
**Current state:** Global throttle (100 req/min) exists but no per-user granularity.
**What needs to happen:**
- Per-user rate limiting using Redis sliding window (user ID, not just IP)
- Different limits per endpoint category:
  - Feed/browse: 200 req/min (high frequency)
  - Post creation: 10 req/min
  - Message sending: 60 req/min
  - Auth endpoints: 5 req/min
  - Search: 30 req/min
  - Upload: 5 req/min
- Return `Retry-After` header on 429 responses
- Rate limit headers on every response (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
**Acceptance criteria:** Abusive users get rate-limited individually without affecting other users. Rate limit headers are present on all responses.

---

## 1.6 — ACCESSIBILITY (Legal requirement in many markets)

### 1.6.1 WCAG 2.1 AA Compliance Audit
**Current state:** Minimal accessibility — some `accessibilityLabel` on key screens, but no systematic coverage.
**What needs to happen:**
- Add `accessibilityLabel` to EVERY interactive element across all 196 screens
- Add `accessibilityRole` to all buttons, links, inputs, images, headers
- Add `accessibilityHint` for non-obvious actions
- Dynamic Type / font scaling: replace all fixed `fontSize` values with scalable text (respect system font size setting)
- Color contrast: audit all text/background combinations against WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Focus management: ensure screen readers navigate screens in logical order
- Reduced motion: respect `prefers-reduced-motion` — disable animations when system setting is on
- High contrast mode: alternative theme with higher contrast ratios
- Image alt text: add meaningful `accessibilityLabel` to all images (eventually AI-generated)
- Video captions: ensure all video content can have captions (caption editor screen exists)
**Acceptance criteria:** Full VoiceOver (iOS) and TalkBack (Android) walkthrough of all major flows works without getting stuck or encountering unlabeled elements.

### 1.6.2 Screen Reader Flow Testing
**What needs to happen:**
- Test these critical flows with screen reader ON:
  1. Sign up → onboarding → first feed view
  2. Browse feed → open post → like → comment
  3. Open Risalah → select conversation → send message
  4. Open Bakra → swipe through reels
  5. Prayer times → Qibla compass
  6. Settings → change any setting
- Fix every broken flow (elements that can't be reached, unlabeled buttons, incorrect reading order)
- Document screen reader shortcuts and publish in accessibility settings
**Acceptance criteria:** A blind user can complete all 6 flows using only VoiceOver/TalkBack.

---

## 1.7 — CONTENT CREATION TOOL DEPTH

### 1.7.1 Video Editor — Real Editing Capabilities
**Current state:** `video-editor.tsx` exists as a screen but actual editing capabilities (trim timeline, split, reorder) are likely basic UI without deep functionality.
**What needs to happen:**
- **Timeline UI:** Horizontal scrollable timeline with frame thumbnails
- **Trim handles:** Drag handles at start/end of clip to trim
- **Split:** Tap to split clip at current position
- **Reorder:** Drag to reorder clips
- **Speed control:** 0.5x, 1x, 1.5x, 2x per clip segment
- **Text overlay:** Add text with font, size, color, position, timing (appear at X seconds)
- **Music/audio:** Add background audio from audio library, adjust volume independently
- **Transitions:** Basic transitions between clips (crossfade, slide, zoom)
- **Preview:** Real-time preview of edits before publishing
- Use `expo-av` for playback, `ffmpeg-kit-react-native` for actual video processing
- Export: render final video and upload via presigned URL to R2
**Acceptance criteria:** User can trim a video, add text overlay, add music, and preview the result — all within the app. Output quality matches input quality.

### 1.7.2 Story Creation — Interactive Stickers
**Current state:** Story creation exists with stickers, but interactive stickers (polls, questions, quizzes, emoji sliders, countdowns) may be shallow.
**What needs to happen:**
- **Poll sticker:** 2-4 options, real-time vote tracking, creator sees results
- **Question sticker:** Followers submit text answers, creator can share responses
- **Quiz sticker:** Multiple choice with correct answer, percentage shows after answering
- **Emoji slider sticker:** Drag emoji on scale (Instagram-style)
- **Countdown sticker:** Set date/time, followers get reminder notification
- **Music sticker:** Show currently playing song name + artist
- **Location sticker:** Shows location name, tappable to see nearby content
- **Mention sticker:** @ another user with their avatar
- **Drawing tools:** Brush, marker, neon, eraser with size and color picker
- All stickers should be draggable, resizable, and rotatable on the story canvas
**Acceptance criteria:** All 9 interactive sticker types work with real data (votes are counted, questions are collected, quizzes track scores).

### 1.7.3 AI-Powered Creation Assistance
**Current state:** AI module exists with Claude API integration but it's unclear how deep the creation assistance goes.
**What needs to happen:**
- **Auto-captions:** Generate captions for videos using Whisper API (multi-language)
- **Caption suggestions:** When creating a post, suggest 3 caption options based on the image/video content
- **Hashtag suggestions:** Suggest relevant hashtags based on content analysis
- **Content scheduling suggestions:** "Your audience is most active at 8 PM" based on analytics
- **Thumbnail generation:** Auto-select best frame from video for thumbnail
- **Content repurposing:** "Turn this long video into 3 Shorts" suggestion
- **Translation:** Auto-translate post content to other languages before publishing
**Acceptance criteria:** When a user uploads media, they receive AI-suggested captions, hashtags, and optimal posting time.

---

## 1.8 — TESTING & MONITORING

### 1.8.1 Sentry Performance Monitoring
**Current state:** Sentry error reporting code exists but unclear if performance monitoring (transactions, slow queries, etc.) is configured.
**What needs to happen:**
- Configure Sentry Performance for API: track every endpoint's response time
- Configure Sentry Performance for mobile: track screen load times, JS bundle parse time
- Set up alerts: >500ms p95 latency, >1% error rate, >100 unhandled errors/hour
- Add custom transactions for critical paths: feed load, message send, video upload
- Breadcrumbs: add context breadcrumbs for debugging (user actions before crash)
- Source maps: upload source maps on each build for readable stack traces
- Release tracking: tag each build version so you can correlate errors to releases
**Acceptance criteria:** Dashboard shows real-time app health: error rate, response times, crash-free rate. Alerts fire on anomalies.

### 1.8.2 Integration Tests for Critical Paths
**Current state:** 96 test files, mostly unit tests. No integration tests that test full request flows.
**What needs to happen:**
- Write integration tests for these critical paths:
  1. Sign up → create profile → first feed load
  2. Create post → appears in feed → like → comment
  3. Send message → received by other user → read receipt
  4. Create reel → upload video → appears in Bakra feed
  5. Follow user → their content appears in feed
  6. Report content → appears in moderation queue
  7. Purchase → payment → creator receives revenue
- Use NestJS testing utilities with real database (test database, not mocks)
- Run in CI on every PR
**Acceptance criteria:** All 7 critical path integration tests pass against a real test database.

---

## 1.9 — INTERNATIONALIZATION DEPTH

### 1.9.1 Professional Translation Review
**Current state:** 8 languages at 2,415 keys each — but translations are machine-generated, not human-reviewed.
**What needs to happen:**
- Professional human review of Arabic translations (most important — Arabic is core audience)
- Professional review of Turkish, Urdu, Bengali translations
- French review by West African French speaker (not Parisian French — different idioms)
- Indonesian/Malay review by native speakers
- Islamic terminology consistency: ensure Arabic Islamic terms (salah, du'a, jumu'ah) are consistently used or transliterated across all languages
- Context-aware translations: same English word may need different translations in different contexts
**Acceptance criteria:** A native speaker of each language confirms translations feel natural, not machine-generated. Islamic terms are handled correctly.

### 1.9.2 In-Feed Post Translation
**Current state:** Inline DM translation exists (Batch 69) but posts in the feed cannot be translated.
**What needs to happen:**
- "See Translation" button on every post/thread/comment that's in a different language than user's setting
- Language detection: auto-detect post language on creation (Claude API or Google Translate API)
- Store detected language in Post model (`language` field)
- Translate on demand (not pre-translate everything): user taps "See Translation" → API call → show translated text below original
- Cache translations to avoid repeated API calls
- Support: Arabic ↔ English ↔ Turkish ↔ Urdu ↔ Bengali ↔ French ↔ Indonesian ↔ Malay
**Acceptance criteria:** User browsing feed sees "See Translation" button on posts in foreign languages. Tapping it shows an inline translation within 1 second.

---

## 1.10 — MODERATION & COMMUNITY SAFETY

### 1.10.1 AI Content Moderation Pipeline
**Current state:** Moderation module exists with manual review queue. AI moderation mentioned but likely rule-based.
**What needs to happen:**
- **Image moderation:** Use Claude Vision API to detect NSFW content on upload — auto-reject or auto-blur
- **Text moderation:** Use Claude API to detect hate speech, harassment, spam in posts and comments
- **Islamic context awareness:** Train moderation to understand Islamic nuance:
  - Quran recitation ≠ music (don't flag as copyright)
  - Discussion of Islamic law ≠ extremism
  - Criticism of actions ≠ hate speech against people
- **Auto-action tiers:**
  - Clear NSFW → auto-remove + warn user
  - Likely violation → auto-blur + send to manual review queue
  - Borderline → leave up but flag for review
- **Appeal flow:** User gets notified of action → can appeal → human reviewer decides
- **Moderation dashboard metrics:** Volume of reports, response time, outcome breakdown
**Acceptance criteria:** NSFW images are blocked within 5 seconds of upload. Hate speech is flagged within 30 seconds. False positive rate <5%.

### 1.10.2 Forward Limit for Misinformation Prevention
**Current state:** No limit on message forwarding. Misinformation can spread virally.
**What needs to happen:**
- Limit message forwarding to 5 conversations at once (WhatsApp's proven approach)
- Mark messages that have been forwarded >5 times with "Frequently Forwarded" label
- "Forwarded" label on all forwarded messages
- Forwarded message counter: track how many times a message has been forwarded globally
- Reduce reach of frequently-forwarded messages in feed/discovery
**Acceptance criteria:** Users cannot forward a message to more than 5 conversations at once. Frequently forwarded messages are labeled.

---

# BATCH 2: "UNBEATABLE"
## New features that make Mizanly the #1 app for Muslims worldwide

**Philosophy:** Now that the foundation is flawless (Batch 1), add features that competitors have in 2026 PLUS Islamic-specific features no competitor can replicate. This is where Mizanly goes from "good Islamic app" to "the app every Muslim needs."

**Estimated effort:** 6-10 weeks of focused work
**Goal:** Go from 7.5/10 to 10/10

---

## 2.1 — 2025-2026 COMPETITOR FEATURES (Catch up to the present)

### 2.1.1 AI Sticker Generator
**What it is:** WhatsApp's newest feature — type a phrase, get a custom AI-generated sticker instantly.
**Why it matters:** Stickers are the #1 form of expression in messaging. Custom stickers make conversations personal and fun.
**What needs to happen:**
- Text input → Claude/DALL-E API → generate sticker image → save to user's sticker collection
- Sticker styles: cartoon, emoji, calligraphy, Islamic geometric, kawaii
- Islamic sticker presets: "Alhamdulillah", "MashAllah", "Eid Mubarak" with beautiful calligraphy
- Sticker packs: user can create and share custom packs
- Integration: available in Risalah message composer, Story sticker picker, comment reactions
**Acceptance criteria:** User types "happy cat saying Alhamdulillah" → gets a custom sticker → can send it in any chat.

### 2.1.2 Voice Message Transcription
**What it is:** WhatsApp and Telegram both offer automatic transcription of voice messages to text.
**Why it matters:** Users in meetings, public places, or with hearing impairments need to read voice messages without playing audio.
**What needs to happen:**
- Use Whisper API to transcribe voice messages on send (background job)
- Store transcription in Message model (`transcription` field)
- Show transcription text below the voice message bubble (expandable)
- Support Arabic, English, Turkish, Urdu, Bengali, French, Indonesian, Malay
- Option to auto-show or tap-to-reveal transcription
- Privacy: transcription happens server-side but text is deleted when message is deleted
**Acceptance criteria:** Every voice message shows a text transcription below it. Arabic voice messages are transcribed accurately.

### 2.1.3 Flipside / Alt Profile
**What it is:** Instagram's new feature — create an alternative profile that only select users can see.
**Why it matters for Muslims:** Many users want a separate persona for dawah content vs personal content. Women may want a public dawah profile and a close-friends-only personal profile.
**What needs to happen:**
- "Create Flipside" option in profile settings
- Alt profile has: separate bio, separate avatar, separate post visibility
- Alt profile is visible only to an approved list (similar to Close Friends)
- Switch between main and alt profile easily (like Instagram's Flipside toggle)
- Posts on alt profile don't appear in public feed or search
- Alt profile analytics are separate from main
**Acceptance criteria:** User can create an alt profile, post content visible only to selected followers, and switch between profiles with one tap.

### 2.1.4 Short Dramas / Episodic Content
**What it is:** Instagram is testing short dramas — stories split into episodes with cliffhangers.
**Why it matters for Muslims:** Islamic educational content (seerah, stories of prophets, fiqh explanations) is perfectly suited for episodic format. Think "Story of Prophet Yusuf — Episode 7."
**What needs to happen:**
- New content type: "Series Episode" — short video (1-10 min) that belongs to a Series
- Series model already exists in Prisma — enhance it:
  - Episode ordering (episode number)
  - "Next Episode" auto-play at end of current episode
  - Series progress tracking per user
  - "Continue Watching" section on home screen
  - Series subscription: get notified when new episode drops
- Episode end screen: "Next Episode in 5 seconds" countdown with skip/cancel
- Series discovery: dedicated section in Minbar and Bakra
- Creator tools: create series, add episodes, set release schedule
**Acceptance criteria:** Creator can create a Series with ordered episodes. Viewer watches Episode 1 → auto-plays Episode 2 → can track progress → gets notified on new episodes.

### 2.1.5 Live Rehearsal Mode
**What it is:** YouTube's feature — start a live stream privately to test audio/video/setup, then go public with one tap.
**Why it matters:** Creators (especially Islamic scholars going live for Q&A) need to verify their setup before going public.
**What needs to happen:**
- "Rehearse" button on go-live screen
- Private stream visible only to creator (and optionally invited co-hosts)
- Real-time preview of audio levels, camera framing, connection quality
- "Go Live" button transitions from private → public instantly
- All rehearsal time is excluded from stream analytics
- Connection quality indicator: green/yellow/red for upload bandwidth
**Acceptance criteria:** Creator taps "Rehearse" → sees their stream privately → taps "Go Live" → stream becomes public. No interruption in stream continuity.

### 2.1.6 Subscriber-Only Live Streams
**What it is:** YouTube's feature — live streams that only paid members can access, or switch a public stream to members-only mid-stream.
**Why it matters:** Monetization for Islamic scholars and creators. Premium Islamic lectures, exclusive Q&A sessions.
**What needs to happen:**
- "Members Only" toggle on go-live screen
- Only users who have active membership to that creator can join
- Mid-stream toggle: switch from public → members-only (or vice versa)
- Non-members see: "This is a members-only stream. Subscribe to watch."
- Integrate with membership tiers (existing `membership-tiers.tsx`)
- Recording: members-only streams can be saved as members-only video replays
**Acceptance criteria:** Creator starts a live stream and limits it to members. Non-members see a paywall. Creator can switch between public/members-only during stream.

### 2.1.7 Thumbnail A/B Testing for Creators
**What it is:** YouTube's feature — upload 3 thumbnails, system shows each to different segments, picks winner by engagement.
**Why it matters:** Thumbnail is the #1 factor in click-through rate. Testing removes guesswork.
**What needs to happen:**
- On video upload: option to upload up to 3 thumbnail variants
- System randomly assigns each viewer one thumbnail variant
- Track click-through rate per variant
- After N impressions (e.g., 1000), declare winner and show only the winning thumbnail
- Show results in creator analytics: "Thumbnail B won with 15% higher CTR"
- Works for: Minbar videos, Bakra reels, Saf posts
**Acceptance criteria:** Creator uploads 3 thumbnails → system tests them → declares winner → shows winning thumbnail to all future viewers.

### 2.1.8 AI Analytics Chat (AskStudio equivalent)
**What it is:** YouTube's AskStudio — chat with AI about your channel performance in natural language.
**Why it matters:** Most creators don't understand analytics dashboards. Natural language makes data accessible.
**What needs to happen:**
- Chat interface in creator dashboard
- User asks: "What was my best post this week?" → AI queries analytics data → responds with answer
- User asks: "When should I post?" → AI analyzes engagement patterns → suggests optimal times
- User asks: "Which hashtags work best for me?" → AI analyzes post performance by hashtag
- Powered by Claude API with creator's analytics data as context
- Store conversation history for continuity
- Suggested questions to help users get started
**Acceptance criteria:** Creator can ask natural language questions about their performance and get accurate, data-backed answers.

### 2.1.9 "Frequently Watched" Creator Badge
**What it is:** TikTok shows a badge on creators you frequently engage with.
**Why it matters:** Helps users identify their favorite creators in the feed at a glance.
**What needs to happen:**
- Track engagement frequency per creator per user (views, likes, shares, comments)
- When engagement exceeds threshold (e.g., 10+ interactions in 7 days), show badge
- Badge appears next to creator name in feed: small star or flame icon
- Badge text: "Frequently Watched" or "Your Favorite"
- Configurable in privacy settings: creators can opt out of being badged
**Acceptance criteria:** Users see a subtle badge on content from creators they frequently engage with.

### 2.1.10 AI Read-Aloud for Content
**What it is:** X's feature — AI reads posts/articles aloud while you scroll.
**Why it matters for Muslims:** Many users want to listen to Islamic content while doing other things. Quran text, hadith, scholarly posts — all benefit from audio.
**What needs to happen:**
- "Listen" button on long-form content (Majlis threads, Minbar descriptions, article-style posts)
- Text-to-speech using system TTS or cloud API (Google Cloud TTS for Arabic quality)
- Arabic TTS with proper tajweed for Quran text (use specialized Quran TTS if available)
- Background audio: continues playing when user navigates away
- Speed control: 0.5x, 1x, 1.5x, 2x
- Mini player at bottom (like podcast player) when audio is playing
**Acceptance criteria:** User taps "Listen" on a thread → hears it read aloud in the correct language → can continue browsing while listening.

### 2.1.11 Web Presence & SEO
**Current state:** Zero web presence. Content is invisible to Google. Instagram and TikTok both index in search now.
**Why it matters:** Billions of searches happen on Google daily. If someone searches "halal recipes" or "Islamic calligraphy", Mizanly content should appear.
**What needs to happen:**
- Landing page / marketing website: mizanly.com with App Store/Play Store links
- Web viewer for public content: mizanly.com/post/[id], mizanly.com/@[username]
- Server-side rendering for SEO (Next.js or Expo Web with SSR)
- Open Graph meta tags for social sharing (title, description, image)
- Structured data (JSON-LD) for Google rich results
- Sitemap generation for public content
- "Download the app for full experience" prompt on web
- Deep linking: clicking a web link on mobile opens the app directly
**Acceptance criteria:** Sharing a Mizanly post on WhatsApp/Twitter shows a rich preview with image, title, and description. Google indexes public Mizanly content.

---

## 2.2 — ISLAMIC MOAT EXPANSION (Features NO competitor can copy)

### 2.2.1 Halal Food & Restaurant Finder
**What it is:** Muslim Pro's #1 utility feature — find halal restaurants nearby.
**Why it matters:** This is the single most-used feature in Islamic apps. Every Muslim traveling or in a non-Muslim-majority country needs this.
**What needs to happen:**
- New module: `halal-finder`
- Database of halal restaurants (integrate with existing APIs: Zabihah, HalalTrip, Google Places API filtered by "halal")
- Map view with pins showing halal restaurants near user's location
- List view sortable by distance, rating, cuisine type
- Restaurant detail: name, address, phone, hours, photos, reviews, halal certification info
- User reviews: rate and review restaurants (tied to Mizanly profile)
- "Verify Halal" community feature: users can confirm/dispute halal status
- Categories: restaurants, grocery stores, butcher shops, bakeries
- Filter by: cuisine (Middle Eastern, South Asian, Turkish, etc.), price range, distance
- Integration with mosque finder (show halal restaurants near mosques)
**Acceptance criteria:** User opens halal finder → sees map of nearby halal restaurants → can view details, read reviews, and get directions.

### 2.2.2 Comprehensive Dua Collection
**What it is:** Categorized collection of duas (supplications) for every occasion with Arabic text, transliteration, and translation.
**Why it matters:** Muslims make duas dozens of times daily. Having them categorized and accessible is a daily utility.
**What needs to happen:**
- Curated database of 200+ authentic duas from Quran and Hadith
- Categories: morning/evening, before/after eating, travel, entering/leaving home, rain, anxiety, illness, gratitude, Ramadan, Hajj, etc.
- Each dua: Arabic text (proper font), transliteration (Latin script), translation (all 8 languages), source (Quran verse or Hadith reference)
- Bookmark favorite duas
- Daily dua notification: random dua from bookmarked collection
- Audio playback: hear the dua recited correctly
- Share dua as beautifully formatted card (Instagram story-style)
- Search duas by keyword
- "Dua of the Day" widget on home screen
**Acceptance criteria:** User can browse 200+ duas by category, hear them recited, bookmark favorites, and share as beautiful cards.

### 2.2.3 Fasting Tracker
**What it is:** Daily fasting log with iftar/suhoor times per location.
**Why it matters:** 1.8 billion Muslims fast during Ramadan. Muslim Pro's fasting tracker is one of its most-used features.
**What needs to happen:**
- Calendar view showing fasting days (completed, missed, current)
- Iftar/suhoor countdown timers (accurate per location using prayer time calculation)
- Quick log: "I fasted today" / "I didn't fast today" with reason (travel, illness, etc.)
- Makeup fasts tracker: how many Ramadan fasts you need to make up
- Optional fasts: track Mondays/Thursdays, Ayyam al-Bid (13th-15th of each month), Day of Arafat, Ashura
- Statistics: total fasts this month/year, streaks
- Integrate with gamification: XP for fasting streaks
- Iftar/suhoor reminders (push notification 15 min before)
- Share fasting streak as card
**Acceptance criteria:** User can log daily fasts, see countdown to iftar/suhoor, track makeup fasts, and get reminders.

### 2.2.4 99 Names of Allah — Interactive Learning
**What it is:** Interactive feature for learning and reflecting on the 99 Names of Allah (Asma ul-Husna).
**Why it matters:** A beloved practice across all madhabs and cultures.
**What needs to happen:**
- Beautiful card-based UI: each name in Arabic calligraphy, transliteration, English meaning, detailed explanation
- Audio: each name recited with correct pronunciation
- Daily name: one name highlighted each day with extended reflection
- Quiz mode: test knowledge of names and meanings
- Memorization tracker: mark names as "learned" or "memorizing"
- Dhikr counter integration: count repetitions of a specific name
- Share individual names as beautiful cards
- Complete Asma ul-Husna recitation audio (all 99 names together)
**Acceptance criteria:** User can browse all 99 names, hear pronunciation, read explanations, track memorization progress, and do dhikr with counter.

### 2.2.5 Quran Memorization (Hifz) Tracker
**What it is:** Track Quran memorization progress — which surahs/pages are memorized, revision schedule, and goals.
**Why it matters:** Millions of Muslims are working on hifz (memorization) at any given time. No social app integrates this.
**What needs to happen:**
- Visual progress: 30 juz (parts) displayed as segments, colored by status (memorized/in-progress/not-started)
- Surah-level tracking: mark individual surahs as memorized, reviewing, or in-progress
- Page-level tracking for precision (604 pages in standard Quran)
- Daily revision schedule: system suggests which pages to review based on spaced repetition
- Goals: "Memorize Surah Al-Kahf by end of month"
- Audio playback for memorization practice (existing 4 reciters)
- Record yourself: record your recitation, compare with professional reciter
- Study partner: connect with someone memorizing the same surah
- Integration with Quran rooms: join live memorization practice rooms
- Statistics: pages memorized, daily practice time, revision consistency
- Streaks and XP for daily Quran practice
**Acceptance criteria:** User can track their hifz progress surah-by-surah, get daily revision suggestions, record their recitation, and find study partners.

### 2.2.6 Prayer-Time-Aware Smart Features
**What it is:** App behavior that adapts to prayer times — the feature NO mainstream social app can replicate.
**Why it matters:** This is the ultimate Islamic differentiator. The app respects your salah instead of competing with it.
**What needs to happen:**
- **Auto-DND during prayer times:** 15 minutes before each prayer, reduce notification frequency. During prayer window, silence non-urgent notifications.
- **"Pray First" nudge:** If user has been scrolling for 30+ min during prayer time, gentle reminder: "It's time for Asr. Come back after prayer!"
- **Prayer streak integration:** Track which prayers user was active on the app (infer they prayed if they went inactive during prayer window)
- **Content boost:** During prayer times, boost Islamic content in feed (Quran, hadith, dhikr)
- **Jummah mode:** Every Friday, special notification with nearest mosque + Surah Al-Kahf reminder
- **Post-prayer content:** After prayer window ends, show "After [Prayer] — here's what you missed" summary
- **Ramadan mode enhancement:** During Ramadan, iftar/suhoor countdowns on home screen, Quran reading progress, special Ramadan-themed UI
- **Eid mode:** On Eid days, special themed UI, "Eid Mubarak" celebration in feed, Eid card creation prompt
**Acceptance criteria:** App demonstrably adapts its behavior to prayer times. Notifications quiet during salah. Islamic content is boosted during prayer windows.

### 2.2.7 Mosque Social Graph
**What it is:** Connect with your local mosque community on Mizanly — like a neighborhood Nextdoor, but for your masjid.
**Why it matters:** The mosque is the center of Muslim community life. Connecting the physical masjid to the digital ummah is Mizanly's killer feature.
**What needs to happen:**
- **Claim/create a mosque page:** Any verified member can create a page for their mosque
- **Mosque feed:** Announcements, events, prayer time changes, community posts
- **Members:** See who else at your mosque is on Mizanly
- **Events:** Mosque events (Jummah khutbah, halaqa, iftar, Eid prayer) with RSVP
- **Imam/scholar page:** Connect mosque with its imam(s) for verified content
- **Donation integration:** Donate to mosque directly through the app (Stripe Connect)
- **Mosque directory:** Find mosques by location, madhab, language, facilities (parking, wudu, women's section, wheelchair access)
- **Multi-mosque:** User can belong to multiple mosque communities
- **Mosque admin tools:** Manage page, post announcements, approve members
**Acceptance criteria:** User can find their local mosque, join its community, see announcements, RSVP to events, and connect with fellow congregants.

### 2.2.8 Islamic Scholar Live Q&A System
**What it is:** Scheduled audio rooms where verified scholars answer questions with a queue system.
**Why it matters:** Access to scholars is limited in many communities. This democratizes Islamic knowledge.
**What needs to happen:**
- **Scheduled Q&A:** Scholar sets a time for live Q&A → followers get notification
- **Question queue:** Users submit questions before/during session → scholar picks from queue
- **Question voting:** Other users upvote questions they want answered (most popular rise to top)
- **Scholar verification:** Verified scholars get special badge (already have scholar-verification screen)
- **Recording:** Sessions are recorded and saved as audio content (searchable by topic)
- **Categories:** Fiqh, Aqeedah, Tafsir, Seerah, Family, Youth, Women's issues, Converts
- **Multi-language:** Sessions in Arabic, English, Turkish, Urdu, etc.
- **Follow-up:** Users can submit follow-up questions on recorded sessions
- **Scholars directory:** Browse verified scholars by specialty, language, madhab
**Acceptance criteria:** Scholar schedules a Q&A session → followers are notified → users submit and vote on questions → scholar goes live and answers → session is recorded and searchable.

### 2.2.9 Islamic Calendar Theming
**What it is:** Entire app UI adapts during Islamic occasions — Ramadan, Dhul Hijjah, Muharram, Mawlid, etc.
**Why it matters:** This creates emotional connection and makes the app feel alive. Instagram does this for Christmas/New Year; Mizanly does it for the Islamic calendar.
**What needs to happen:**
- **Ramadan theme:** Crescent moon accents, lantern icons, iftar/suhoor countdowns on home screen, special emerald-gold Ramadan color scheme, special loading animations
- **Dhul Hijjah theme (Hajj season):** Kaaba-inspired accents, Day of Arafat special content, Eid al-Adha celebration mode
- **Muharram theme:** Reflective/subdued UI, Ashura reminders and content
- **Eid themes (both Eids):** Celebration mode — confetti on app open, special Eid greeting cards, "Eid Mubarak" banner
- **Jummah (every Friday):** Subtle golden accent on the app bar, Surah Al-Kahf reminder
- **Theme transitions:** Smooth transition between regular and occasion themes
- **User control:** Toggle occasion themes on/off in settings
**Acceptance criteria:** During Ramadan, the app feels noticeably different — crescent accents, countdown timers, themed loading animations. Users feel the app celebrates with them.

---

## 2.3 — MONETIZATION & CREATOR ECONOMY

### 2.3.1 Virtual Currency Economy
**What it is:** TikTok's model — buy coins with real money → send gifts to creators → creators cash out.
**Why it matters:** This is how TikTok makes $4B+/year from creator economy.
**What needs to happen:**
- **Coins:** Purchase with real money via Stripe (coin packs: 100/$0.99, 500/$4.99, 1000/$9.99)
- **Gifts:** Send animated gifts during live streams and on posts (various price tiers: Rose=1 coin, Crown=100 coins, Universe=1000 coins)
- **Islamic gifts:** Special Islamic-themed gifts (Crescent, Mosque, Quran Book, Lantern) — NO haram symbols
- **Diamonds:** Creator receives diamonds when they get gifts (1 diamond = 0.5 coins value)
- **Cashout:** Creator converts diamonds → real money via Stripe Connect → bank transfer
- **Revenue split:** 70% to creator, 30% to Mizanly (better than TikTok's 50/50)
- **Gift animations:** Beautiful animated overlays when gifts are sent (especially during live streams)
- **Leaderboard:** Top gifted creators of the week/month
- **Sadaqah integration:** Option to donate coins to verified Islamic charities instead of gifting to creators
**Acceptance criteria:** User can buy coins, send gifts (with animations) to creators during lives and on posts, creator can cash out to their bank account.

### 2.3.2 Stripe Connect for Creator Payouts
**What it is:** Real money flowing to creators via Stripe Connect — the backbone of creator monetization.
**What needs to happen:**
- Onboard creators as Stripe Connect accounts (identity verification, bank account linking)
- Revenue sources: gifts, memberships, tips, marketplace sales
- Dashboard showing: total earned, pending payout, available balance
- Payout schedule: weekly automatic or instant (small fee)
- Tax reporting: annual earnings summary (1099 for US creators)
- Multi-currency: pay creators in their local currency
- Minimum payout threshold: $10
- Fraud detection: flag suspicious gifting patterns (self-gifting, coordinated gifting)
**Acceptance criteria:** Creator completes onboarding → earns money from gifts/memberships → sees balance in dashboard → receives payout to bank account.

### 2.3.3 Promoted Posts / Self-Serve Ads
**What it is:** "Boost this post" — simple ad system where creators/businesses pay to show their content to more people.
**Why it matters:** This is how the platform generates revenue (not just creator economy).
**What needs to happen:**
- "Boost Post" button on any post (screen exists: `boost-post.tsx`)
- Targeting: location, age range, interests, language
- Budget: daily budget ($1-$1000/day), total budget, duration
- Bidding: CPM (cost per 1000 impressions) or CPC (cost per click)
- Payment: Stripe
- Reporting: impressions, clicks, CTR, cost per result
- Review: boosted posts go through ad review before going live
- Islamic ad policy: no haram products, no deceptive content, no interest-based financial products
- "Sponsored" label clearly visible on boosted content
**Acceptance criteria:** Creator/business can boost a post, set target audience and budget, pay, and see performance metrics.

---

## 2.4 — RETENTION & ENGAGEMENT

### 2.4.1 Push Notification Intelligence
**What it is:** Smart notification system that drives retention without being annoying.
**What needs to happen:**
- **Creator vanity notifications:** "Your reel got 1,000 views!" — this is the #1 creator retention hook
- **Streak anxiety:** "Don't lose your 7-day streak! Open the app to keep it going"
- **Social proof:** "5 people from your community joined Mizanly this week"
- **Islamic daily digest:** Morning notification with prayer times + hadith of the day + trending in your community
- **Weekly creator analytics:** "Your best post this week got 500 likes. Here's why."
- **Re-engagement:** "You haven't posted in 3 days — your followers miss you"
- **Prayer reminders:** Configurable per-prayer notifications with adhan audio
- **Smart timing:** Don't send notifications during prayer times, don't send after 10 PM
- **Notification frequency cap:** Max 10 notifications per day (configurable in settings)
- **Notification channels (Android):** Separate channels for messages, social, Islamic, creator analytics — each independently configurable
**Acceptance criteria:** Users receive timely, relevant notifications that bring them back to the app. Notifications respect prayer times and user preferences.

### 2.4.2 "Continue Watching" & Smart Resume
**What it is:** Netflix-style "Continue Watching" for videos and series.
**What needs to happen:**
- Track watch progress for all Minbar videos and Series episodes
- "Continue Watching" row on home screen showing partially-watched content
- Resume from exact timestamp when reopening a video
- "Watch Next" recommendation at end of video
- Mark as "Watched" — remove from Continue Watching
- Sync watch progress across devices (via API, stored per user)
**Acceptance criteria:** User watches 50% of a video → closes app → reopens → sees "Continue Watching" → taps → resumes from exact position.

### 2.4.3 Daily Islamic Engagement Loop
**What it is:** Daily Islamic content that creates a habit loop — open the app every day for Islamic inspiration.
**What needs to happen:**
- **Morning briefing screen:** Prayer times today, hadith of the day, verse of the day, weather, Islamic date
- **Dhikr daily challenge:** "Say SubhanAllah 33 times today" with counter and streak
- **Quran daily ayah:** One ayah per day with tafsir — new one unlocked each day
- **Community leaderboard:** "Your mosque community completed 500 dhikr today"
- **Daily reflection prompt:** "What are you grateful for today?" — post to feed or keep private
- **Completion reward:** Complete all 3 daily tasks (dhikr + Quran + reflection) → get bonus XP + special badge
**Acceptance criteria:** User opens app → sees morning briefing → completes daily Islamic tasks → earns XP → builds a daily habit.

---

## 2.5 — COMMUNITY & SOCIAL FEATURES

### 2.5.1 Community Notes for Islamic Content
**What it is:** X/Twitter's Community Notes — crowd-sourced fact-checking, adapted for Islamic content.
**Why it matters:** Islamic misinformation is a real problem — fabricated hadiths, wrong fatwas, misquoted scholars.
**What needs to happen:**
- Verified users can add context notes to posts
- Notes require citations (Quran verse, hadith reference, scholar opinion)
- Other verified users rate notes as "helpful" or "not helpful"
- Notes that reach helpfulness threshold are shown publicly below the post
- Scholar-verified notes get priority display
- Categories: "Fabricated Hadith", "Out of Context", "Disputed Opinion", "Needs Source"
- Integration with fatwa Q&A: link to relevant scholarly discussions
- Moderation: false/malicious notes get removed, repeat offenders lose note privileges
**Acceptance criteria:** A post sharing a fabricated hadith gets a community note: "This hadith is classified as fabricated by Imam Al-Albani [source]". The note is visible to all viewers.

### 2.5.2 Collaborative Posts (Collab)
**What it is:** Instagram's collab feature — two creators co-author a post, it appears on both profiles.
**What needs to happen:**
- Invite co-author when creating a post
- Co-author accepts/declines invitation
- Post appears on both profiles with both names
- Engagement metrics (likes, comments) are shared
- Both creators can see analytics
- Works for: posts, reels, threads, videos
- "Created with @username" label on the post
**Acceptance criteria:** Two creators co-author a post → it appears on both profiles → both see engagement metrics.

### 2.5.3 Checklists in Messages
**What it is:** Telegram's checklist feature — create shared to-do lists within conversations.
**Why it matters for Muslims:** Mosque event planning, study circle assignments, Hajj/Umrah trip planning — all benefit from shared checklists.
**What needs to happen:**
- New message type: "checklist"
- Create checklist with title and items
- Any participant can check/uncheck items
- Real-time sync: all participants see checks instantly
- Assignable items: assign a checklist item to a specific person
- Due dates on items (optional)
- Completion notification: "All items on 'Iftar Planning' are done!"
**Acceptance criteria:** User creates a checklist in group chat → members can check off items → completion syncs in real-time.

---

## 2.6 — INFRASTRUCTURE FOR SCALE

### 2.6.1 Meilisearch Full Integration
**Current state:** Docker-compose ready, but search still uses Prisma `contains` (SQL LIKE).
**What needs to happen:**
- Deploy Meilisearch instance (cloud or self-hosted)
- Index: Users, Posts, Threads, Videos, Hashtags, Mosques, Duas, Quran text
- Sync: push new content to Meilisearch on create/update/delete (via job queue)
- Typo tolerance: searching "Alhamduliilah" should find "Alhamdulillah"
- Faceted search: filter by content type, space, language, category
- Federated search: one query searches across all content types
- Search suggestions: show suggestions as user types
- Recent searches: store and display recent search queries
- Trending searches: show what's popular right now
- Arabic-aware tokenization: proper handling of Arabic text (root extraction, diacritics)
**Acceptance criteria:** Searching "quran tafsir surah baqarah" returns relevant content within 50ms, with typo tolerance and Arabic support.

### 2.6.2 WebSocket Clustering
**Current state:** Single Socket.io instance — can't scale horizontally.
**What needs to happen:**
- Add Socket.io Redis adapter (@socket.io/redis-adapter) for multi-instance support
- Sticky sessions via load balancer or Redis-based room management
- Connection state stored in Redis (not in-memory)
- Graceful reconnection: client auto-reconnects on server restart
- Connection monitoring: track active WebSocket connections per server
- Verify: Quran rooms, voice channels, live streams all work across multiple instances
**Acceptance criteria:** Deploy 3 API instances behind load balancer. Two users on different instances can chat in real-time without issues.

### 2.6.3 Database Float→Decimal for Money
**Current state:** Money fields use Float, which causes precision issues (e.g., $19.99 stored as 19.989999...).
**What needs to happen:**
- Identify all money-related fields in Prisma schema (price, amount, balance, commission, etc.)
- Create migration: change Float → Decimal for all money fields
- Update all services that read/write money fields
- Add monetary calculation utilities that use Decimal arithmetic (not floating point)
- Test: $19.99 + $0.01 = $20.00, not $20.000000001
**Acceptance criteria:** All financial calculations are exact. No floating-point precision errors in payments, tips, or commissions.

---

## 2.7 — BRANDING & LAUNCH READINESS

### 2.7.1 App Icon & Splash Screen
**What needs to happen:**
- Professional app icon: emerald background, gold accent, Arabic calligraphy element, simple enough to read at 29x29px
- Adaptive icon for Android (background + foreground layers)
- Animated splash screen: logo reveal with spring animation (Lottie or Reanimated)
- Splash screen should feel premium: emerald gradient → logo appears → smooth transition to app
- App icon must look good on both light and dark home screens

### 2.7.2 App Store Assets
**What needs to happen:**
- 6+ screenshots for App Store (iPhone 6.7", 6.5", 5.5")
- 6+ screenshots for Play Store (phone, tablet)
- Short description (80 chars): "The social platform for the global Muslim Ummah"
- Long description (4000 chars): features, differentiators, Islamic values
- App preview video (30 sec): show all 5 spaces in action
- Feature graphic for Play Store (1024x500)
- Keywords: islamic, muslim, quran, prayer, halal, social, ummah
- Privacy policy URL
- Support URL

### 2.7.3 Custom Notification Sounds
**What needs to happen:**
- Default notification sound: subtle, pleasant, Islamic-inspired (not generic phone beep)
- Adhan notification: choice of 6 muezzins (already have reciters)
- Message received: soft ping
- New follower: gentle chime
- Achievement unlocked: celebratory sound
- All sounds should be <1 second (except adhan) and not annoying on repeat

---

## COMPLETION CRITERIA — What 10/10 Actually Means

A 10/10 Mizanly means:

1. **A new user can browse content without signing up** — and the content is engaging from second one
2. **The feed learns preferences within 30 minutes** — powered by real ML, not SQL weights
3. **Every interaction has haptic feedback and smooth animation** — the app feels native, not webview
4. **Push notifications bring users back daily** — smart, relevant, respectful of prayer times
5. **Creators can earn real money** — coins, gifts, memberships, payouts to bank accounts
6. **Islamic features are deeper than any utility app** — prayer, Quran, dua, fasting, mosque finder, halal food, all in one app
7. **The app works offline** — cached content, queued actions, prayer times without internet
8. **Content loads instantly** — video preloading, progressive images, CDN optimization
9. **8 languages feel native** — professionally reviewed, not machine-translated
10. **Search actually works** — typo-tolerant, Arabic-aware, federated across all content types
11. **Every screen is accessible** — screen readers, font scaling, high contrast
12. **The infrastructure scales** — multi-region, job queues, WebSocket clustering
13. **Moderation is AI-powered** — NSFW detection, hate speech filtering, misinformation prevention
14. **The app has a brand identity** — professional icon, splash screen, notification sounds
15. **Content is discoverable on the web** — SEO, social sharing, deep links

When ALL of the above are true, the app is 10/10.

---

## METRICS SUMMARY

| Category | Items in Batch 1 | Items in Batch 2 |
|----------|-----------------|-----------------|
| Launch Blockers (P0) | 5 | 0 |
| Performance & Infra | 8 | 3 |
| UX/UI Polish | 8 | 0 |
| Algorithm & Discovery | 4 | 0 |
| Security & Privacy | 4 | 0 |
| Accessibility | 2 | 0 |
| Content Creation | 3 | 0 |
| Testing & Monitoring | 2 | 0 |
| i18n | 2 | 0 |
| Moderation | 2 | 0 |
| Competitor Features | 0 | 11 |
| Islamic Moat | 0 | 9 |
| Monetization | 0 | 3 |
| Retention | 0 | 3 |
| Community | 0 | 3 |
| Branding | 0 | 3 |
| **TOTAL** | **40** | **35** |

**Grand Total: 75 major items across 2 batches**

---

*This document was created with brutal honesty. The previous "10/10" assessment was wrong. This plan, when fully executed, will actually earn that rating.*
