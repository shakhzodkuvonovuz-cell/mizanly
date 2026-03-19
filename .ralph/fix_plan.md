# Mizanly — Master Fix Plan (Batches 72-83)
# Source: docs/COMPETITOR_DEEP_AUDIT_2026.md

## Phase 1: CRITICAL — Close Biggest Gaps (Batches 72-75)

### Batch 72: Algorithm & Discovery Engine
- [x] 72.1 Install pgvector extension on Neon PostgreSQL
- [x] 72.2 Add `Embedding` model to schema.prisma (id, contentId, contentType, vector, metadata, createdAt)
- [x] 72.3 Create `embeddings.service.ts` — call Gemini text-embedding-004 API to generate embeddings for posts/reels/threads
- [x] 72.4 Create `embedding-pipeline.service.ts` — background job to embed all existing content
- [x] 72.5 Update `recommendations.service.ts` — replace SQL scoring with pgvector KNN similarity search
- [x] 72.6 Implement multi-stage ranking: candidate gen (pgvector top 500) → scoring (behavioral signals) → reranking (diversity injection)
- [x] 72.7 Add session-aware feed adaptation — track in-session signals, adjust recommendations mid-scroll
- [x] 72.8 Islamic-aware algorithm boost — weight Islamic content higher during prayer times, Ramadan, Fridays
- [x] 72.9 Create `/api/v1/feed/personalized` endpoint that serves the new algorithm
- [x] 72.10 Wire mobile feed screens (saf.tsx, bakra.tsx, majlis.tsx) to new personalized endpoint
- [x] 72.11 Cold start: serve trending + editorial picks to users with < 10 interactions

### Batch 73: Performance & Media Optimization
- [x] 73.1 Implement video preloading in Bakra — preload next 2 videos while watching current
- [x] 73.2 Add BlurHash/ThumbHash progressive image loading — generate hashes on upload, show blurred placeholder → sharp
- [x] 73.3 Implement offline cache layer — AsyncStorage for API responses, FileSystem for viewed media
- [x] 73.4 Code splitting — lazy-load screen bundles per space using React.lazy + Suspense
- [x] 73.5 Background upload — upload media in background with progress tracking, don't block UI
- [x] 73.6 CDN cache headers on all Cloudflare R2 objects — `Cache-Control: public, max-age=31536000, immutable` for media
- [x] 73.7 Add skeleton → content crossfade animation (fade transition instead of instant swap)
- [x] 73.8 Implement `react-native-fast-image` or Expo Image with caching for all image components
- [x] 73.9 Bundle size analysis — identify and remove unused dependencies
- [x] 73.10 Add FPS monitoring hook — detect jank, log to console in dev

### Batch 74: Onboarding & Cold Start
- [x] 74.1 Anonymous browsing mode — allow browsing trending content without account (skip auth guard on feed endpoints)
- [x] 74.2 Reduce onboarding to 2 steps — username + interests (merge profile into settings, remove suggested follows from required flow)
- [x] 74.3 Wire interest selection to feed algorithm — store selected interests in user profile, use as initial embedding seed
- [x] 74.4 Contact sync — implement phone contact permission flow + find friends endpoint
- [x] 74.5 Seed feed for new users — curate 50 high-quality Islamic content pieces as default feed
- [x] 74.6 Deep linking — handle `mizanly.app/post/[id]` URLs to open content without account
- [x] 74.7 "Skip for now" on every onboarding step
- [x] 74.8 Islamic onboarding: optional "Choose your madhab" step for personalized scholarly content
- [x] 74.9 Re-engagement push for dropped onboarding — "You're 1 step away from joining the Ummah"

### Batch 75: Infrastructure & Monitoring
- [x] 75.1 Add BullMQ job queue with Redis — for background jobs (push notifications, embeddings, email)
- [x] 75.2 Move push notification sending to BullMQ worker (don't block API responses)
- [x] 75.3 Move embedding generation to BullMQ worker
- [x] 75.4 Add Sentry error monitoring — `@sentry/nestjs` for backend, `@sentry/react-native` for mobile
- [x] 75.5 Add health check dashboard — `/api/v1/health` returns DB, Redis, R2, Stream status
- [x] 75.6 WebSocket clustering — add Redis adapter for Socket.io (allows multiple server instances)
- [x] 75.7 Database connection pool tuning — configure Neon pooler settings
- [x] 75.8 Add request logging middleware — log slow queries (> 500ms), error rates
- [x] 75.9 Rate limiting per-user — Redis sliding window per userId, not just global IP

## Phase 2: HIGH — Reach Competitive Parity (Batches 76-79)

### Batch 76: Retention & Engagement Loops
- [x] 76.1 "Your reel got X views!" push notification — trigger when view count crosses 100, 1K, 10K
- [x] 76.2 "Don't lose your 7-day streak!" push notification — send 2 hours before streak expires
- [x] 76.3 "3 friends posted while you were away" — social FOMO notification after 24h absence
- [x] 76.4 Morning Islamic digest push — prayer times + hadith + trending in your community
- [x] 76.5 Weekly creator analytics summary push — "Your best post this week got X views"
- [x] 76.6 Streak-break grace period — Islamic: pause streak during Friday prayer time
- [x] 76.7 Session depth tracking — track scroll depth, time spent, interactions per session
- [x] 76.8 "You're all caught up" celebration — add confetti animation + haptic to CaughtUpCard

### Batch 77: UX/UI Polish
- [x] 77.1 Shared element transitions — post thumbnail → full post screen (react-native-shared-element or Reanimated)
- [x] 77.2 Gesture-driven space switching — swipe left/right between Saf/Bakra/Majlis tabs
- [x] 77.3 Header/tab hide on scroll down, reveal on scroll up (Animated header pattern)
- [x] 77.4 Ambient mode for Minbar — extract dominant color from video, apply as background tint
- [x] 77.5 Double-tap heart burst animation — particle effects + scale + glow on post like
- [x] 77.6 Story cube transition — 3D cube rotation between stories
- [x] 77.7 Haptic feedback on ALL interactions — like, save, send, tab switch, pull-to-refresh
- [x] 77.8 Tab bar active indicator animation — sliding dot/line under active tab
- [x] 77.9 Contextual UI: hide bottom tab bar during full-screen video playback

### Batch 78: Accessibility (WCAG AA)
- [x] 78.1 Add `accessibilityLabel` to EVERY interactive element across all 202 screens
- [x] 78.2 Dynamic Type support — use `Text` with `allowFontScaling` and test at 200% size
- [x] 78.3 Reduced motion mode — add setting, respect `prefers-reduced-motion`, disable all spring animations
- [x] 78.4 High contrast theme — additional theme option with AA-compliant contrast ratios
- [x] 78.5 Focus indicators — visible focus ring for keyboard/switch users on web
- [x] 78.6 Screen reader testing — test full flows with VoiceOver (iOS) and TalkBack (Android)
- [x] 78.7 Color contrast audit — verify emerald/gold on dark backgrounds meet WCAG AA (4.5:1)
- [x] 78.8 AI alt text — generate alt text for uploaded images using Claude Vision API on upload
- [x] 78.9 Keyboard navigation for Expo Web — add keyboard shortcuts (j/k scroll, l like, s save)

### Batch 79: Monetization Infrastructure
- [x] 79.1 Stripe Connect onboarding — create connected accounts for creators, KYC flow
- [x] 79.2 Virtual currency system — Coins (buy with Stripe) → Gifts (send to creators) → Diamonds (creator balance) → Cashout
- [x] 79.3 Implement 70/30 revenue split logic in payment processing
- [x] 79.4 Stripe Instant Payouts for creator cashout (< 30 min to bank)
- [x] 79.5 Simple "Boost Post" ad system — budget selector, audience targeting (location, interests, age), Stripe payment
- [x] 79.6 Sadaqah verification — partner integration with Islamic Relief, ICNA Relief (hardcoded verified charities)
- [x] 79.7 Revenue dashboard — wire `revenue.tsx` to real Stripe data (earnings, payouts, pending)
- [x] 79.8 Tax reporting foundation — track creator earnings for 1099 generation

## Phase 3: MOAT — Make Mizanly Unbeatable (Batches 80-83)

### Batch 80: Islamic Moat (10/10)
- [x] 80.1 Prayer-time-aware notifications — auto-DND during salah windows, batch notifications between prayers
- [x] 80.2 "Pray first" nudge — gentle reminder when opening app during prayer time
- [x] 80.3 Adhan integration — play adhan at prayer times (configurable, opt-in)
- [x] 80.4 Jummah reminder — Friday prayer notification with nearest mosque from mosque-finder
- [x] 80.5 Ramadan mode depth — accurate iftar/suhoor timers per location, daily fasting tracker
- [x] 80.6 Islamic content curation engine — tag content by category (fiqh, seerah, tafsir, dawah, nasheeds)
- [x] 80.7 Mosque social graph — connect with your mosque's community, see members
- [x] 80.8 Islamic scholar live Q&A — scheduled audio rooms with queue system
- [x] 80.9 Islamic calendar theming — app UI subtly changes during Ramadan (gold accents), Dhul Hijjah, Muharram

### Batch 81: Content Creation Depth
- [x] 81.1 Deep video editor — timeline UI with trim handles, split markers, speed per segment
- [x] 81.2 AI caption generation — call Whisper API on video upload, generate editable captions
- [x] 81.3 AI background removal — ML Kit or cloud API for green-screen-like effect without green screen
- [x] 81.4 Islamic overlay frames — thobe, hijab, mosque backgrounds as static composites (no AR needed)
- [x] 81.5 Licensed nasheed integration — partner with Muslim artists for royalty-free nasheed library
- [x] 81.6 Community template marketplace — let users share reel templates
- [x] 81.7 Video transitions — fade, slide, zoom, dissolve between clips in editor

### Batch 82: Moderation & Safety
- [x] 82.1 AI image moderation — Claude Vision API for NSFW detection on all uploaded images
- [x] 82.2 Islamic-context NLP moderation — flag hate speech, Islamophobia, sectarian content
- [x] 82.3 Forward limit — max 5 forwards per message to prevent misinformation spread
- [x] 82.4 Kindness reminder — "Would you like to rephrase?" before posting detected angry comments
- [x] 82.5 Auto-remove + appeal flow — auto-remove clear violations, notify user, allow appeal
- [x] 82.6 Moderation analytics dashboard — volume, response times, outcomes, trends
- [x] 82.7 Rate-limited viral content — slow distribution of unverified viral content

### Batch 83: Branding & i18n
- [x] 83.1 App icon design — emerald/gold with Arabic calligraphy element (create as SVG → PNG)
- [x] 83.2 Animated splash screen — logo reveal with spring animation
- [x] 83.3 Custom notification sounds — subtle, Islamic-inspired tones
- [x] 83.4 App Store screenshot designs — 5 screenshots per space showing key features
- [x] 83.5 Add 5 languages: Urdu, Bahasa Indonesia, Bengali, French, Malay (machine-translate from en.json, flag for review)
- [x] 83.6 In-feed "See translation" button — auto-detect post language, translate on tap
- [x] 83.7 Full RTL testing pass — verify all 202 screens render correctly in Arabic
- [x] 83.8 Locale-aware formatting — dates, numbers, currency per user locale

---

## Completion Criteria
ALL items above marked [x] = EXIT_SIGNAL: true
Any items remaining = EXIT_SIGNAL: false, continue working
