# RALPH — Batch 2 Task Manifest: "UNBEATABLE"
## 50 tasks. Includes 6 carryover from Batch 1. Zero shortcuts. Every one verified.

> **Read `docs/ralph-instructions.md` first.** It contains behavioral rules you MUST follow.
> **Read `CLAUDE.md` second.** It contains codebase rules, architecture, and component patterns.
> **Then start executing tasks below in order.**

---

## SECTION 0: BATCH 1 CARRYOVER (Tasks 1-6)
### These were left open from Batch 1. Complete them first.

---

### [x] Task 1: Background Job Queue (BullMQ) — Done: BullMQ installed, 6 queues + 5 processors, posts/follows/reels/videos/threads wired

**Carryover reason:** Required `npm install bullmq` in Windows terminal. An `AsyncJobService` was created as in-process fallback, but real job queue is needed for production.

**Files to read first:**
- `apps/api/package.json` — check if bullmq is now installed
- `apps/api/src/common/` — look for existing async-job or queue code
- `apps/api/src/modules/notifications/push.service.ts`
- `apps/api/src/modules/upload/` — upload handling
- `apps/api/src/modules/ai/ai.service.ts`

**Pre-requisite:** Run `npm install bullmq` in `apps/api` FIRST. If npm is not in shell PATH, this task is BLOCKED — mark it and move on.

**What to implement:**

1. **Install and configure BullMQ:**
   - If `bullmq` is in package.json, proceed. If not, try `npm install bullmq` — if that fails, mark BLOCKED.
   - Create `apps/api/src/common/queue/queue.module.ts` — global queue module
   - Configure with Upstash Redis connection (reuse existing Redis config from `apps/api/src/config/`)
   - Create named queues:
     - `notifications` — push notification delivery
     - `media-processing` — image resize, BlurHash generation, video transcription
     - `analytics` — engagement tracking, counter updates
     - `webhooks` — webhook delivery with retry
     - `search-indexing` — Meilisearch index updates (future)
     - `ai-tasks` — content moderation, caption generation

2. **Create queue processors:**
   - `apps/api/src/common/queue/processors/notification.processor.ts`
     - Processes push notification jobs
     - Retry 3 times with exponential backoff (1s, 10s, 60s)
   - `apps/api/src/common/queue/processors/media.processor.ts`
     - Image resize + BlurHash generation on upload
   - `apps/api/src/common/queue/processors/webhook.processor.ts`
     - Delivers webhooks with HMAC-SHA256 signing
     - Retry: 1s, 5s, 30s, 5m, 30m

3. **Wire existing synchronous operations to queues:**
   - Post creation → enqueue: notification to followers, media processing, search indexing
   - Message send → enqueue: push notification to recipient
   - User follow → enqueue: notification to followed user
   - Content report → enqueue: AI moderation check
   - Replace direct synchronous calls with `queue.add()` calls

4. **Bull Board dashboard (optional):**
   - Mount at `/admin/queues` behind admin auth
   - Shows pending/active/completed/failed jobs per queue

**Verification:**
- Create a post → notification job appears in queue → gets processed
- API response time for post creation is NOT blocked by notification delivery
- Failed jobs retry automatically with backoff

---

### [x] Task 2: Video Editor — Real Editing Capabilities — Done: expo-av playback, FFmpeg export, progress tracking, 38 i18n keys in 8 langs

**Carryover reason:** Required `npm install ffmpeg-kit-react-native` in Windows terminal.

**Files to read first:**
- `apps/mobile/app/(screens)/video-editor.tsx` (read COMPLETELY)
- `apps/mobile/package.json` — check if ffmpeg-kit is installed
- Search for any video processing utilities in `apps/mobile/src/`

**Pre-requisite:** Run `npm install ffmpeg-kit-react-native` in `apps/mobile` FIRST. If npm is not in shell PATH, this task is BLOCKED.

**What to implement:**

1. **Timeline UI:**
   - Horizontal scrollable strip of video frame thumbnails
   - Current position indicator (playhead line)
   - Trim handles at start and end — draggable with pan gesture
   - Time labels showing current position and total duration
   - Pinch-to-zoom on timeline for precision

2. **Core editing operations:**
   - **Trim:** Drag handles to cut beginning/end. Preview updates in real-time.
   - **Speed:** Buttons for 0.5x, 1x, 1.5x, 2x — applied to entire video or selected segment
   - **Volume:** Slider to adjust audio volume (0-100%)
   - **Text overlay:** Tap "Add Text" → text input modal → set font (DMSans or PlayfairDisplay), size (sm/md/lg), color (white/emerald/gold/black), position (top/center/bottom), appear timestamp, disappear timestamp
   - **Music:** Select track from audio library → independent volume control → preview mixed audio

3. **Preview player:**
   - Full preview of edited result using `expo-av`
   - Play/pause button with current timestamp
   - Timeline playhead syncs with preview position
   - Tap on timeline to seek

4. **Export pipeline:**
   - Use `ffmpeg-kit-react-native` for: trim, speed change, audio mixing, text overlay burn-in
   - Show progress bar during export (0-100%)
   - On completion: upload to R2 via presigned URL
   - Quality: maintain input resolution, H.264/AAC output, reasonable file size
   - Error handling: if export fails, show meaningful error (not crash)

5. **UI requirements per CLAUDE.md:**
   - Use `<BottomSheet>` for settings/options modals
   - Use `<Skeleton>` for loading states
   - Use theme spacing tokens
   - Use `<Icon>` for all icons (play, pause, trim, text, music, etc.)
   - i18n keys for ALL 8 languages

**Verification:**
- Record 30s video → trim to 15s → add text "Bismillah" at 0-3s → add nasheed audio → export
- Exported video plays with all edits correctly applied
- Export completes in reasonable time (< 60s for 30s source)

**i18n keys (ALL 8 files):**
```
videoEditor.trim: "Trim"
videoEditor.speed: "Speed"
videoEditor.volume: "Volume"
videoEditor.addText: "Add Text"
videoEditor.addMusic: "Add Music"
videoEditor.export: "Export"
videoEditor.exporting: "Exporting..."
videoEditor.exportComplete: "Video exported successfully"
videoEditor.exportFailed: "Export failed. Please try again."
videoEditor.preview: "Preview"
videoEditor.timeline: "Timeline"
videoEditor.textPosition: "Text Position"
videoEditor.textTiming: "Text Timing"
```

---

### [x] Task 3: Ambient Mode for Video Player — Done: real color extraction via react-native-image-colors, ambient gradient on VideoPlayer, hash fallback, caching

**Carryover reason:** Deferred as lower priority. Now implementing.

**Files to read first:**
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (or equivalent video component)
- `apps/mobile/app/(screens)/video/[id].tsx` — Minbar video detail
- `apps/mobile/app/(tabs)/bakra.tsx` — Bakra reel feed
- Check for `expo-image` usage (it has color extraction capabilities)

**What to implement:**

1. **Color extraction from thumbnail:**
   - When video loads, extract the dominant color from its thumbnail
   - Approach A (preferred): Sample the thumbnail image at 5 points (4 corners + center), compute average RGB
   - Approach B: Use a predefined color palette and map thumbnails to nearest color
   - Approach C: If `react-native-image-colors` is available, use it
   - Cache extracted color per video ID (don't re-extract on re-render)

2. **Ambient gradient background:**
   - Behind the video player, render a `LinearGradient` from `expo-linear-gradient`:
     - Top: extracted color at 30% opacity
     - Bottom: `colors.dark.bg` (full opacity)
   - The gradient creates a subtle glow effect matching the video content
   - Apply to both Minbar full player and Bakra reel player

3. **Smooth color transitions:**
   - When switching between videos, animate the gradient color change
   - Use `react-native-reanimated` `useAnimatedStyle` with `withTiming(color, { duration: 400 })`
   - Interpolate between old and new dominant colors

4. **Fallback:**
   - If color extraction fails: use `colors.emerald` at 10% opacity as default ambient
   - If video has no thumbnail: skip ambient mode for that video

**Verification:**
- Play a video with blue ocean → background has subtle blue tint
- Switch to video with green nature → color smoothly transitions to green
- Play video with no thumbnail → default emerald ambient, no crash

---

### [x] Task 4: E2E Encryption Enhancement — Done: safety numbers, key change notifications, status endpoint, i18n in 8 langs

**Carryover reason:** Audit revealed the encryption service is more complete than expected (key registration, envelopes, rotation with transactions). This task enhances what exists.

**Files to read first:**
- `apps/api/src/modules/encryption/encryption.service.ts` (already audited — solid)
- `apps/api/src/modules/encryption/encryption.controller.ts`
- `apps/mobile/app/(screens)/verify-encryption.tsx`
- `apps/api/src/gateways/chat.gateway.ts` — message transmission

**Current state (from audit):**
- Key registration with SHA-256 fingerprints ✅
- Public key storage per user ✅
- Key envelope system per conversation ✅
- Key rotation with transactions + conflict handling ✅
- Bulk key retrieval ✅

**What still needs to be done:**

1. **Safety number display in verify-encryption.tsx:**
   - Fetch both users' key fingerprints: `GET /api/v1/encryption/keys/:userId`
   - Compute safety number: concatenate both fingerprints (sorted by userId for deterministic order), hash with SHA-256, format as groups of 5 digits (60 digits total)
   - Display as: `12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890`
   - Also generate a QR code from the safety number (use `react-native-qrcode-svg`)
   - "Scan" button to scan the other person's QR and compare
   - If match: show green checkmark "Encryption verified"
   - If mismatch: show red warning "Keys don't match — this may indicate a security issue"

2. **Key change notification:**
   - When a user re-registers their key (new device, key rotation), notify their conversation partners
   - In the conversation view: show system message "Security code changed for [username]. Tap to verify."
   - This mimics Signal/WhatsApp's "security code changed" banner

3. **Encryption status indicator:**
   - In conversation header: small lock icon if both users have registered encryption keys
   - Tap lock → navigates to verify-encryption screen
   - No lock icon if either user hasn't registered keys

**Verification:**
- Open verify-encryption with another user → see 60-digit safety number
- Re-register key → conversation partner sees "security code changed" message
- Conversation header shows lock icon when both users have keys

**i18n keys (ALL 8 files):**
```
encryption.verified: "Encryption verified"
encryption.mismatch: "Keys don't match"
encryption.safetyNumber: "Safety Number"
encryption.scanCode: "Scan Code"
encryption.securityCodeChanged: "Security code changed for {{name}}"
encryption.tapToVerify: "Tap to verify"
encryption.encrypted: "Messages are end-to-end encrypted"
encryption.notEncrypted: "Encryption not set up"
```

---

### [x] Task 5: Integration Tests for Critical Paths — Done: test infra + 3 suites (feed/messaging/auth), QueueService mock added

**Carryover reason:** Needed test database setup and real Prisma client integration tests.

**Files to read first:**
- `apps/api/test/` (if exists)
- `apps/api/jest.config.ts` or `package.json` jest config
- `apps/api/src/modules/posts/posts.controller.ts`
- `apps/api/src/modules/messages/messages.controller.ts`
- `apps/api/src/modules/feed/feed.controller.ts`

**What to implement:**

1. **Integration test infrastructure:**
   - Create `apps/api/test/integration/` directory
   - Create `apps/api/test/integration/test-app.ts`:
     - Uses `Test.createTestingModule()` with the real AppModule
     - Overrides the PrismaService to use a test database URL (from env `TEST_DATABASE_URL` or falls back to main DB with `_test` suffix)
     - Provides helper methods: `createTestUser()`, `getAuthToken()`, `cleanup()`
   - Create `apps/api/jest.integration.config.ts`:
     - Separate config for integration tests
     - Different test match pattern: `**/*.integration.spec.ts`
     - Longer timeout (30s per test)

2. **Integration test: Feed flow**
   - `test/integration/feed.integration.spec.ts`:
   ```
   - Create user A with 0 follows → GET /feed/trending → returns posts (not empty)
   - Create user A, create user B → A follows B → B creates post → GET /feed → A sees B's post
   - GET /feed/trending without auth token → returns 200 (anonymous browsing works)
   ```

3. **Integration test: Messaging flow**
   - `test/integration/messaging.integration.spec.ts`:
   ```
   - Create users A and B → A creates conversation with B → A sends message → GET conversation messages → message appears
   - Forward message to 5 conversations → succeeds
   - Forward message to 6 conversations → returns 400
   ```

4. **Integration test: Auth flow**
   - `test/integration/auth.integration.spec.ts`:
   ```
   - GET /feed/trending without token → 200 (anonymous OK)
   - POST /posts without token → 401 (auth required for writes)
   - GET /users/me/data-export without token → 401
   ```

5. **Cleanup:**
   - Each test suite cleans up its test data in `afterAll`
   - Use transactions where possible to roll back test data

**Verification:**
- Run `npx jest --config jest.integration.config.ts` → all integration tests pass
- Tests don't leave orphan data in the database

---

### [x] Task 6: Professional Translation Quality Sweep — Done: audit script, fixed Arabic {{count}} mismatch, 0 structural issues remaining

**Carryover reason:** Requires manual review — but can be partially automated by checking for common machine-translation artifacts.

**Files to read first:**
- `apps/mobile/src/i18n/ar.json`
- `apps/mobile/src/i18n/tr.json`
- `apps/mobile/src/i18n/ur.json`
- `apps/mobile/src/i18n/en.json` (as reference)

**What to implement (automated checks):**

1. **Consistency audit script:** Create `apps/mobile/scripts/audit-i18n.js`
   - Check all 8 files have identical key sets (no missing keys)
   - Check no values contain raw English text in non-English files (e.g., "Submit" appearing in ar.json)
   - Check interpolation variables: every `{{variable}}` in en.json must appear in all translations
   - Check no empty string values
   - Check no values are identical to English (likely untranslated) — flag for review
   - Output: list of flagged keys per language

2. **Islamic terminology consistency:**
   - Create a glossary check: these terms should be consistent across all languages:
     - "Salah" / "Prayer" — verify each language uses its standard Islamic term
     - "Du'a" / "Supplication"
     - "Jumu'ah" / "Friday Prayer"
     - "Iftar" / "Breaking fast"
     - "Suhoor" / "Pre-dawn meal"
     - "Dhikr" / "Remembrance"
     - "Quran" — should NEVER be translated, always "Quran" or "القرآن"
   - Script checks for inconsistent usage within each language file

3. **RTL validation for Arabic:**
   - Check all Arabic strings with mixed content (Arabic + numbers, Arabic + English names) have proper Unicode directional markers if needed
   - Verify no strings will render incorrectly in RTL mode

4. **Fix found issues:**
   - For each flagged key: review and fix the translation
   - For untranslated keys: use Claude API to generate better translations, then manually verify
   - For inconsistent terminology: standardize

**Verification:**
- Run audit script → 0 issues remaining
- Spot-check 20 random keys per language → all feel natural
- Islamic terms are consistent within each language

---

## SECTION 1: 2025-2026 COMPETITOR FEATURES (Tasks 7-17)
### Catch up to what Instagram, TikTok, YouTube, WhatsApp, and X shipped in the last year

---

### [x] Task 7: AI Sticker Generator — Done: Claude SVG generation, 20 Islamic presets, 10/day rate limit, content moderation, i18n 8 langs

**What it is:** WhatsApp's newest feature — type a phrase, AI generates a custom sticker.

**Files to read first:**
- `apps/api/src/modules/stickers/stickers.service.ts`
- `apps/api/src/modules/stickers/stickers.controller.ts`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/mobile/src/components/risalah/StickerPackBrowser.tsx`
- `apps/mobile/app/(screens)/sticker-browser.tsx`

**What to implement:**

1. **Backend — AI sticker generation endpoint:**
   - `POST /api/v1/stickers/generate` — body: `{ prompt: string, style?: 'cartoon' | 'calligraphy' | 'emoji' | 'geometric' | 'kawaii' }`
   - Use Claude API to generate an image description, then use an image generation API (DALL-E 3, Stable Diffusion, or Midjourney API) to create the sticker
   - If no image generation API is available: use Claude to generate SVG sticker art (simpler but functional)
   - Output: 512x512 PNG with transparent background
   - Upload generated image to R2 → return URL
   - Rate limit: 10 generations per user per day
   - Content moderation: run prompt through moderation before generating (reject inappropriate requests)

2. **Backend — Save generated sticker:**
   - `POST /api/v1/stickers/save` — save generated sticker to user's personal sticker collection
   - Each user has a "My Stickers" pack (auto-created)
   - Sticker model: `{ id, userId, imageUrl, prompt, style, createdAt }`

3. **Backend — Islamic preset stickers:**
   - Pre-generate a set of 20+ Islamic stickers:
     - "Alhamdulillah" in beautiful calligraphy
     - "MashAllah" with decorative border
     - "Eid Mubarak" with crescent and stars
     - "SubhanAllah" with geometric pattern
     - "JazakAllah Khair" with elegant design
     - "Bismillah" with traditional calligraphy
     - Mosque silhouette, Quran book, prayer hands, lantern, crescent moon
   - These are available to all users without generation

4. **Frontend — Sticker generator UI:**
   - In sticker browser: "Create Sticker" button at top
   - Text input: "Describe your sticker..."
   - Style selector: grid of 5 style options with preview thumbnails
   - "Generate" button → loading state → preview generated sticker
   - "Save to My Stickers" button
   - "Try Again" button to regenerate with same prompt
   - Generated stickers appear in "My Stickers" tab of sticker browser

5. **Frontend — Integration points:**
   - Risalah message composer: sticker picker shows "My Stickers" tab + "Create" option
   - Story creation: stickers available in sticker drawer
   - Comment reactions: option to react with custom sticker

**Verification:**
- Type "happy cat saying Alhamdulillah" → get a custom sticker → save it → send in chat
- Islamic preset stickers are visible in sticker browser
- Rate limit works: 11th generation in a day → rejected
- Inappropriate prompt → rejected with moderation message

**i18n keys (ALL 8 files):**
```
stickers.createSticker: "Create Sticker"
stickers.describeSticker: "Describe your sticker..."
stickers.generate: "Generate"
stickers.generating: "Creating your sticker..."
stickers.saveToMyStickers: "Save to My Stickers"
stickers.tryAgain: "Try Again"
stickers.myStickers: "My Stickers"
stickers.islamicStickers: "Islamic Stickers"
stickers.stylCartoon: "Cartoon"
stickers.styleCalligraphy: "Calligraphy"
stickers.styleEmoji: "Emoji"
stickers.styleGeometric: "Geometric"
stickers.styleKawaii: "Kawaii"
stickers.dailyLimitReached: "You've reached your daily sticker limit"
```

---

### [x] Task 8: Voice Message Transcription — Done: Whisper API integration, auto-detect language, async transcription on voice send, i18n 8 langs

**What it is:** WhatsApp + Telegram both auto-transcribe voice messages to text.

**Files to read first:**
- `apps/api/src/modules/messages/messages.service.ts`
- `apps/api/src/modules/ai/ai.service.ts` — check for Whisper integration
- `apps/mobile/src/components/risalah/MessageBubble.tsx` (or equivalent)
- `apps/api/prisma/schema.prisma` — Message model

**What to implement:**

1. **Backend — Auto-transcribe on voice message send:**
   - When a voice message is created (`messageType === 'voice'`), enqueue a transcription job
   - Call Whisper API with the voice message audio URL
   - Store transcription in `Message.transcription` field (add `transcription: String?` to Message model if not exists)
   - Support languages: Arabic, English, Turkish, Urdu, Bengali, French, Indonesian, Malay
   - If transcription fails (bad audio, unsupported language): leave `transcription` as null (no error to user)

2. **Frontend — Show transcription below voice bubble:**
   - In MessageBubble: if `message.messageType === 'voice'` and `message.transcription` exists:
     - Show expandable text below the voice player: "[Transcription] actual text here"
     - Collapsed by default (just shows first line with "..." and "Show more")
     - Tap to expand full transcription
   - If transcription is still processing: show "Transcribing..." with subtle loading indicator
   - If no transcription (failed or not yet processed): show nothing (no error state)

3. **User preference:**
   - Setting in notification/privacy settings: "Auto-transcribe voice messages" (on/off)
   - Default: on
   - When off: no transcription jobs are created for this user's received messages

**Verification:**
- Send a voice message in Arabic → transcription appears below the voice bubble within 30 seconds
- Send a voice message in English → English transcription appears
- Toggle setting off → new voice messages have no transcription
- Bad audio (mumbling/noise) → no transcription shown (graceful failure)

**i18n keys (ALL 8 files):**
```
messages.transcription: "Transcription"
messages.transcribing: "Transcribing..."
messages.showMore: "Show more"
messages.showLess: "Show less"
settings.autoTranscribe: "Auto-transcribe voice messages"
settings.autoTranscribeDescription: "Automatically convert voice messages to text"
```

---

### [x] Task 9: Flipside / Alt Profile — Done: AltProfile + AltProfileAccess models, CRUD endpoints, access control, isAltProfile on Post, i18n 8 langs

**What it is:** Instagram's new feature — create an alternative private profile.

**Files to read first:**
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/prisma/schema.prisma` — User model
- `apps/mobile/app/(screens)/edit-profile.tsx`
- `apps/mobile/app/(screens)/profile/[id].tsx`

**What to implement:**

1. **Backend — Alt profile model:**
   - Add new model `AltProfile`:
     ```
     model AltProfile {
       id          String   @id @default(cuid())
       userId      String   @unique
       user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
       displayName String
       bio         String?
       avatarUrl   String?
       isActive    Boolean  @default(true)
       createdAt   DateTime @default(now())
     }
     ```
   - Add `AltProfileAccess` model for who can see the alt profile:
     ```
     model AltProfileAccess {
       id           String     @id @default(cuid())
       altProfileId String
       altProfile   AltProfile @relation(fields: [altProfileId], references: [id], onDelete: Cascade)
       userId       String
       createdAt    DateTime   @default(now())
       @@unique([altProfileId, userId])
     }
     ```

2. **Backend — Alt profile endpoints:**
   - `POST /api/v1/users/me/alt-profile` — create alt profile (max 1 per user)
   - `PUT /api/v1/users/me/alt-profile` — update alt profile (name, bio, avatar)
   - `DELETE /api/v1/users/me/alt-profile` — delete alt profile
   - `GET /api/v1/users/me/alt-profile` — get own alt profile
   - `POST /api/v1/users/me/alt-profile/access` — add users who can see it
   - `DELETE /api/v1/users/me/alt-profile/access/:userId` — remove access
   - `GET /api/v1/users/:id/alt-profile` — view someone's alt profile (only if you have access)

3. **Backend — Alt profile posts:**
   - Add `isAltProfile: Boolean @default(false)` to Post model
   - Posts created with `isAltProfile: true` are only visible to users with alt profile access
   - Feed filters: exclude alt profile posts from public feed
   - Alt profile posts appear in a separate "Flipside" feed for approved viewers

4. **Frontend — Create/manage alt profile:**
   - In settings → "Flipside Profile" option
   - Create: name, bio, avatar (separate from main profile)
   - Manage access: list of approved users with add/remove
   - Toggle: switch between posting as main vs alt profile

5. **Frontend — View alt profile:**
   - On profile screen: if you have access, show "See Flipside" button
   - Flipside view shows alt avatar, alt bio, alt-only posts
   - Clear visual indicator that you're viewing the flipside (different background tint, "Flipside" label)

**Verification:**
- Create alt profile → visible in settings
- Add 3 users to access list → they can see flipside
- Create post as alt → appears in flipside feed for approved users → NOT in public feed
- User without access → cannot see flipside

**i18n keys (ALL 8 files):**
```
flipside.title: "Flipside Profile"
flipside.create: "Create Flipside"
flipside.description: "A private profile visible only to select people"
flipside.manageAccess: "Manage Who Can See"
flipside.addPeople: "Add People"
flipside.removePerson: "Remove"
flipside.seeFlipside: "See Flipside"
flipside.postAsFlipside: "Post to Flipside"
flipside.viewingFlipside: "Viewing Flipside"
flipside.backToMain: "Back to Main Profile"
```

---

### [x] Task 10: Short Dramas / Episodic Content Enhancement — Done: SeriesProgress model, continue watching, videoUrl/thumbnailUrl/duration on episodes, i18n 8 langs

**What it is:** Instagram's episodic mini-dramas + Islamic educational series.

**Files to read first:**
- `apps/api/prisma/schema.prisma` — Series model (already exists)
- `apps/api/src/modules/gamification/gamification.service.ts` — series-related logic
- `apps/mobile/app/(screens)/series-detail.tsx`
- `apps/mobile/app/(screens)/series-discover.tsx`

**What to implement:**

1. **Backend — Enhance Series model:**
   - Ensure Series model has: `id, userId, title, description, thumbnailUrl, category, episodeCount, subscriberCount, createdAt`
   - Add `SeriesEpisode` model if not exists:
     ```
     model SeriesEpisode {
       id          String   @id @default(cuid())
       seriesId    String
       series      Series   @relation(fields: [seriesId], references: [id], onDelete: Cascade)
       episodeNum  Int
       title       String
       videoUrl    String
       thumbnailUrl String?
       duration    Int      // seconds
       createdAt   DateTime @default(now())
       @@unique([seriesId, episodeNum])
       @@index([seriesId, episodeNum])
     }
     ```
   - Add `SeriesSubscription` model:
     ```
     model SeriesSubscription {
       id        String   @id @default(cuid())
       seriesId  String
       userId    String
       createdAt DateTime @default(now())
       @@unique([seriesId, userId])
     }
     ```
   - Add `SeriesProgress` model:
     ```
     model SeriesProgress {
       id            String   @id @default(cuid())
       seriesId      String
       userId        String
       lastEpisodeNum Int
       lastTimestamp  Int     @default(0) // seconds into episode
       updatedAt     DateTime @updatedAt
       @@unique([seriesId, userId])
     }
     ```

2. **Backend — Series endpoints:**
   - `POST /api/v1/series` — create a series
   - `POST /api/v1/series/:id/episodes` — add episode to series
   - `GET /api/v1/series/:id` — get series with episodes
   - `POST /api/v1/series/:id/subscribe` — subscribe (get notified on new episodes)
   - `DELETE /api/v1/series/:id/subscribe` — unsubscribe
   - `PUT /api/v1/series/:id/progress` — update watch progress (`{ episodeNum, timestamp }`)
   - `GET /api/v1/series/:id/progress` — get user's watch progress
   - `GET /api/v1/series/discover` — discover series by category, trending, new
   - `GET /api/v1/series/continue-watching` — series with progress (for home screen)
   - Categories: `seerah`, `fiqh`, `quran-tafsir`, `islamic-history`, `lifestyle`, `cooking`, `education`, `entertainment`

3. **Frontend — Series detail screen enhancement:**
   - Episode list with numbers, titles, durations, play buttons
   - Progress indicator per episode (watched %, completion checkmark)
   - "Continue Watching" button that opens the last episode at saved timestamp
   - Subscribe button with bell icon
   - Creator info with follow button

4. **Frontend — Episode end screen:**
   - When episode ends: "Next Episode in 5 seconds" countdown with large "Play Next" and small "Cancel" buttons
   - Show next episode title and thumbnail
   - If last episode: "Series Complete!" celebration with share button

5. **Frontend — Continue Watching section:**
   - On home screen / Minbar tab: horizontal scroll row "Continue Watching"
   - Shows series with progress bar (percentage of current episode)
   - Tap → opens episode at saved timestamp

6. **Frontend — Series discovery screen enhancement:**
   - Categories row at top (horizontal scroll)
   - "New Series" section
   - "Trending Series" section
   - "Islamic Education" section (filtered by category)

**Verification:**
- Create series with 5 episodes → appears in discover
- Subscribe → get notification on new episode
- Watch episode 1 to 50% → close → reopen → "Continue Watching" shows → tap → resumes at exact timestamp
- Finish episode 1 → auto-play countdown for episode 2 → plays episode 2

**i18n keys (ALL 8 files):**
```
series.episodes: "Episodes"
series.episode: "Episode {{num}}"
series.subscribe: "Subscribe"
series.subscribed: "Subscribed"
series.continueWatching: "Continue Watching"
series.nextEpisodeIn: "Next episode in {{seconds}}s"
series.playNext: "Play Next"
series.seriesComplete: "Series Complete!"
series.newSeries: "New Series"
series.trendingSeries: "Trending Series"
series.categories: "Categories"
series.progress: "{{percent}}% complete"
```

---

### [ ] Task 11: Live Rehearsal Mode

**Files to read first:**
- `apps/api/src/modules/live/live.controller.ts`
- `apps/api/src/modules/live/live.service.ts` (if exists, or check within live controller)
- `apps/mobile/app/(screens)/go-live.tsx`
- `apps/mobile/app/(screens)/schedule-live.tsx`

**What to implement:**

1. **Backend — Rehearsal state:**
   - Add `isRehearsal: Boolean @default(false)` to LiveStream model (or equivalent)
   - Rehearsal streams: not visible in live feeds, not discoverable, no notifications sent
   - `PUT /api/v1/live/:id/go-live` — transition rehearsal → public (sets `isRehearsal: false`, sends notifications)
   - `PUT /api/v1/live/:id/rehearse` — start as rehearsal
   - Analytics: rehearsal time excluded from stream statistics

2. **Frontend — Rehearsal UI in go-live.tsx:**
   - Before going live: "Rehearse" button alongside "Go Live"
   - In rehearsal mode:
     - Banner: "REHEARSAL — Only you can see this" in `colors.gold` background
     - Preview: see your own camera/mic output
     - Connection quality indicator (green/yellow/red bar based on upload speed)
     - Audio level meter (visual bar showing mic input level)
     - "Go Live" button prominently displayed to transition to public
     - "End Rehearsal" button to stop without ever going public
   - Transition animation: rehearsal banner fades out, "LIVE" badge fades in

**Verification:**
- Start rehearsal → stream is private → check live feeds → not visible
- Go live from rehearsal → stream becomes public → followers notified
- End rehearsal without going live → no public trace

**i18n keys (ALL 8 files):**
```
live.rehearse: "Rehearse"
live.rehearsalMode: "Rehearsal Mode"
live.rehearsalBanner: "Only you can see this"
live.goLiveFromRehearsal: "Go Live"
live.endRehearsal: "End Rehearsal"
live.connectionQuality: "Connection Quality"
live.audioLevel: "Audio Level"
```

---

### [ ] Task 12: Subscriber-Only Live Streams

**Files to read first:**
- `apps/api/src/modules/live/` — live streaming module
- `apps/api/src/modules/monetization/` — membership logic
- `apps/mobile/app/(screens)/go-live.tsx`
- `apps/mobile/app/(screens)/live/` — live viewer screens

**What to implement:**

1. **Backend:**
   - Add `isSubscribersOnly: Boolean @default(false)` to LiveStream model
   - When `isSubscribersOnly: true`: only users with active membership to the creator can join
   - `PUT /api/v1/live/:id/subscribers-only` — toggle subscribers-only mid-stream
   - Joining a subscribers-only stream without membership → 403 with paywall info
   - Non-subscribers can see the stream exists (title, viewer count) but can't watch

2. **Frontend — Go live screen:**
   - Toggle: "Subscribers Only" switch (available if creator has membership tiers)
   - When on: show notice "Only your subscribers can watch"
   - Mid-stream toggle: button to switch between public ↔ subscribers-only

3. **Frontend — Viewer paywall:**
   - Non-subscriber tries to join: BottomSheet with:
     - "This is a subscribers-only stream"
     - Creator info + subscription tiers
     - "Subscribe to Watch" CTA button
     - Monthly price display

**Verification:**
- Start subscribers-only live → non-subscriber can't join → sees paywall
- Subscriber joins successfully
- Toggle mid-stream to public → non-subscribers can now join

**i18n keys (ALL 8 files):**
```
live.subscribersOnly: "Subscribers Only"
live.subscribersOnlyDescription: "Only your subscribers can watch"
live.subscribeToWatch: "Subscribe to Watch"
live.subscribersOnlyStream: "This is a subscribers-only stream"
live.switchToPublic: "Switch to Public"
live.switchToSubscribers: "Switch to Subscribers Only"
```

---

### [ ] Task 13: Thumbnail A/B Testing for Creators

**Files to read first:**
- `apps/api/src/modules/videos/videos.service.ts`
- `apps/api/src/modules/reels/reels.service.ts`
- `apps/api/src/modules/posts/posts.service.ts`
- `apps/api/prisma/schema.prisma` — Post, Reel, Video models
- `apps/mobile/app/(screens)/create-video.tsx` or `create-reel.tsx`

**What to implement:**

1. **Backend — Thumbnail variants model:**
   - Add `ThumbnailVariant` model:
     ```
     model ThumbnailVariant {
       id            String   @id @default(cuid())
       contentType   String   // 'post' | 'reel' | 'video'
       contentId     String
       thumbnailUrl  String
       impressions   Int      @default(0)
       clicks        Int      @default(0)
       isWinner      Boolean  @default(false)
       createdAt     DateTime @default(now())
       @@index([contentType, contentId])
     }
     ```
   - When serving content with multiple thumbnails: randomly assign viewer to a variant, track impression
   - When viewer clicks/opens content: track click for that variant
   - After 1000 total impressions: declare winner (highest CTR), set `isWinner: true`
   - After winner declared: all future impressions use the winning thumbnail

2. **Backend endpoints:**
   - `POST /api/v1/thumbnails/variants` — upload up to 3 thumbnail variants for a piece of content
   - `GET /api/v1/thumbnails/variants/:contentType/:contentId` — get variants with stats (creator only)
   - `GET /api/v1/thumbnails/serve/:contentType/:contentId` — get the thumbnail to show this viewer (random if testing, winner if declared)
   - `POST /api/v1/thumbnails/impression` — track impression (called when content appears in feed)
   - `POST /api/v1/thumbnails/click` — track click (called when content is opened)

3. **Frontend — Upload variants:**
   - On create-video, create-reel: "Add thumbnail variants" option
   - Image picker allowing up to 3 images
   - Preview all 3 side by side
   - After publishing: wait for results

4. **Frontend — Results in creator analytics:**
   - In post insights / creator dashboard: "Thumbnail Test Results"
   - Show each variant with: thumbnail image, impressions, clicks, CTR percentage
   - Winner highlighted with crown icon
   - "Test completed" or "Testing — {{impressions}}/1000 impressions"

**Verification:**
- Upload video with 3 thumbnails → different viewers see different thumbnails
- After 1000 impressions → winner declared → all viewers see winning thumbnail
- Creator analytics shows test results with CTR per variant

**i18n keys (ALL 8 files):**
```
thumbnails.addVariants: "Add Thumbnail Variants"
thumbnails.variant: "Variant {{num}}"
thumbnails.testing: "Testing..."
thumbnails.impressions: "{{count}} impressions"
thumbnails.clicks: "{{count}} clicks"
thumbnails.ctr: "{{percent}}% CTR"
thumbnails.winner: "Winner"
thumbnails.testComplete: "Test Complete"
thumbnails.testInProgress: "Testing — {{current}}/{{total}} impressions"
```

---

### [ ] Task 14: AI Analytics Chat (AskStudio equivalent)

**Files to read first:**
- `apps/api/src/modules/creator/creator.service.ts`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/mobile/app/(screens)/creator-dashboard.tsx`
- `apps/mobile/app/(screens)/analytics.tsx`

**What to implement:**

1. **Backend — AI analytics chat endpoint:**
   - `POST /api/v1/creator/ask` — body: `{ question: string }`
   - Fetches creator's analytics data: top posts (last 30 days), follower growth, engagement rates, best posting times, hashtag performance
   - Constructs a Claude API prompt with the analytics data as context + user's question
   - Returns Claude's natural language answer
   - Rate limit: 20 questions per hour
   - Example questions and answers:
     - "What was my best post this week?" → "Your reel 'Morning Adhkar Routine' posted Tuesday got 2,340 views and 18% engagement — your highest this week."
     - "When should I post?" → "Based on your last 30 posts, your audience engages most between 8-9 PM local time, especially on Tuesdays and Fridays."
     - "Which hashtags work best?" → "#IslamicReminders drove 40% more impressions than your average. Consider using it more."

2. **Frontend — Chat interface in analytics screen:**
   - Chat-style UI at bottom of analytics/creator-dashboard
   - Or: floating "Ask AI" button → opens chat BottomSheet
   - Text input: "Ask about your performance..."
   - AI responses displayed as chat messages with typing animation
   - Suggested questions to get started (3-5 preset questions as tappable chips)
   - Chat history persisted in AsyncStorage (last 20 messages)

**Verification:**
- Creator asks "What's my best post?" → AI gives data-backed answer
- Creator asks "When should I post?" → AI analyzes engagement patterns
- Rate limit: 21st question in an hour → rejected

**i18n keys (ALL 8 files):**
```
analytics.askAI: "Ask AI"
analytics.askAboutPerformance: "Ask about your performance..."
analytics.suggestedQuestions: "Suggested Questions"
analytics.aiThinking: "Analyzing your data..."
analytics.bestPost: "What was my best post this week?"
analytics.bestTime: "When should I post?"
analytics.bestHashtags: "Which hashtags work best for me?"
analytics.audienceGrowth: "How is my audience growing?"
analytics.questionsRemaining: "{{count}} questions remaining this hour"
```

---

### [ ] Task 15: AI Read-Aloud for Content

**Files to read first:**
- `apps/mobile/app/(screens)/thread/[id].tsx` — thread detail (long text content)
- `apps/mobile/app/(screens)/post/[id].tsx` — post detail
- Check for any existing TTS usage in the app

**What to implement:**

1. **Frontend — Text-to-Speech integration:**
   - Use `expo-speech` (Expo's built-in TTS API) — no install needed
   - "Listen" button (speaker icon) on content types with substantial text:
     - Majlis threads (especially long ones)
     - Post captions (if > 100 characters)
     - Hadith of the day
     - Dua text
   - When tapped: reads the content aloud using system TTS
   - Language detection: match TTS language to content language
   - Arabic TTS: use Arabic voice if available on device

2. **Frontend — Playback controls:**
   - Mini player bar at bottom (appears when TTS is active):
     - Play/Pause button
     - Speed control: 0.75x, 1x, 1.25x, 1.5x
     - Stop button (dismisses mini player)
     - Title/preview of what's being read
   - Background audio: TTS continues when user navigates away
   - Tap mini player → scroll to the content being read

3. **Frontend — Qur'an special handling:**
   - For Quran text: use a higher-quality Arabic TTS voice if available
   - Or: link to existing Quran audio (4 reciters already in the app) instead of TTS
   - Never use generic TTS for Quran verses — redirect to proper recitation

**Verification:**
- Open long thread → tap "Listen" → content is read aloud
- Navigate away → TTS continues in background with mini player
- Change speed to 1.5x → speech speed changes
- Arabic content → read in Arabic voice

**i18n keys (ALL 8 files):**
```
tts.listen: "Listen"
tts.listening: "Listening..."
tts.pause: "Pause"
tts.resume: "Resume"
tts.stop: "Stop"
tts.speed: "Speed"
tts.readingAloud: "Reading aloud"
```

---

### [ ] Task 16: Web Presence & SEO (Landing Page + Content Previews)

**Files to read first:**
- `apps/api/src/modules/posts/posts.controller.ts` — public post endpoint
- `apps/api/src/modules/users/users.controller.ts` — public profile endpoint
- `apps/api/src/main.ts` — check if any static file serving exists

**What to implement:**

1. **Backend — Open Graph meta tags endpoint:**
   - `GET /api/v1/og/post/:id` — returns HTML with Open Graph tags for a post:
     ```html
     <meta property="og:title" content="Post by @username" />
     <meta property="og:description" content="First 200 chars of content..." />
     <meta property="og:image" content="https://r2.../media/post-image.jpg" />
     <meta property="og:url" content="https://mizanly.com/post/abc123" />
     <meta property="og:type" content="article" />
     <meta name="twitter:card" content="summary_large_image" />
     ```
   - Similar for: `/api/v1/og/reel/:id`, `/api/v1/og/profile/:username`, `/api/v1/og/thread/:id`
   - These endpoints return minimal HTML (just head meta tags + redirect to app store)
   - For search engines: the meta tags allow rich preview cards when links are shared

2. **Backend — Sitemap generation:**
   - `GET /sitemap.xml` — generates sitemap of public content
   - Include: public profiles, popular posts (last 30 days), trending threads
   - Update daily (cache in Redis)
   - robots.txt: allow crawling of public content

3. **Frontend deep linking:**
   - Configure Expo linking: `mizanly.com/post/:id` → opens post in app
   - Configure universal links (Apple) and app links (Android)
   - If app not installed: redirect to App Store / Play Store
   - Share button generates links in format: `mizanly.com/post/:id`

4. **Landing page (minimal):**
   - Static HTML page at mizanly.com root:
     - App name, tagline, 3 key feature highlights
     - App Store + Play Store download buttons
     - 3 screenshot images
     - Footer with privacy policy, terms, contact
   - Serve from Cloudflare Pages or as static route from API

**Verification:**
- Share a post link on WhatsApp → shows rich preview card with image, title, description
- Share a profile link on Twitter → shows profile card with avatar and bio
- Click link on phone with app installed → opens post in app
- Click link on phone without app → redirects to app store

---

### [ ] Task 17: "Frequently Watched" Creator Badge

**Files to read first:**
- `apps/api/src/modules/feed/feed.service.ts`
- `apps/api/prisma/schema.prisma` — FeedInteraction model
- `apps/mobile/src/components/saf/PostCard.tsx`

**What to implement:**

1. **Backend — Engagement frequency tracking:**
   - Already have `FeedInteraction` model tracking views, likes, comments per user per post
   - New query: for a given viewer, aggregate engagement count per creator in last 7 days
   - Threshold: 10+ interactions with same creator in 7 days = "frequently watched"
   - `GET /api/v1/feed/frequent-creators` — returns list of creator IDs the user frequently engages with

2. **Backend — Include in feed response:**
   - When returning feed posts: for each post, include `isFrequentCreator: boolean`
   - This is computed per-viewer, not globally

3. **Frontend — Badge display:**
   - On PostCard / ThreadCard: if `isFrequentCreator`, show small badge next to creator name
   - Badge: star icon (⭐) or flame icon, with text "Favorite" or just the icon
   - Subtle — should not overpower the content
   - Use `colors.gold` for the badge color

**Verification:**
- Like/comment on 10+ posts from same creator → that creator gets "favorite" badge in feed
- Badge appears on all their posts, not just the ones you interacted with

---

## SECTION 2: ISLAMIC MOAT EXPANSION (Tasks 18-26)
### Features that NO competitor can replicate

---

### [ ] Task 18: Halal Food & Restaurant Finder

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic.controller.ts`
- `apps/mobile/app/(screens)/mosque-finder.tsx` — reference for map-based finder

**What to implement:**

1. **Backend — Halal restaurant module:**
   - New model `HalalRestaurant`:
     ```
     model HalalRestaurant {
       id             String   @id @default(cuid())
       name           String
       address        String
       city           String
       country        String
       latitude       Float
       longitude      Float
       cuisineType    String?  // "Middle Eastern", "South Asian", "Turkish", etc.
       priceRange     Int?     // 1-4 ($-$$$$)
       halalCertified Boolean  @default(false)
       certifyingBody String?
       phone          String?
       website        String?
       imageUrl       String?
       averageRating  Float    @default(0)
       reviewCount    Int      @default(0)
       addedById      String?
       isVerified     Boolean  @default(false)
       createdAt      DateTime @default(now())
       @@index([latitude, longitude])
       @@index([city])
     }
     ```
   - `HalalRestaurantReview` model:
     ```
     model HalalRestaurantReview {
       id           String @id @default(cuid())
       restaurantId String
       userId       String
       rating       Int    // 1-5
       comment      String?
       createdAt    DateTime @default(now())
       @@unique([restaurantId, userId])
     }
     ```

2. **Backend — Endpoints:**
   - `GET /api/v1/halal/restaurants?lat=X&lng=Y&radius=10` — find nearby (radius in km)
   - `GET /api/v1/halal/restaurants/:id` — restaurant detail
   - `POST /api/v1/halal/restaurants` — add a restaurant (community-contributed)
   - `POST /api/v1/halal/restaurants/:id/reviews` — add review
   - `GET /api/v1/halal/restaurants/:id/reviews` — get reviews
   - `POST /api/v1/halal/restaurants/:id/verify` — community verify halal status (voting system)
   - Filter params: `cuisine`, `priceRange`, `certified`, `verified`

3. **Frontend — Halal finder screen:**
   - Create `apps/mobile/app/(screens)/halal-finder.tsx`
   - Map view (using `react-native-maps` or similar) with restaurant pins
   - List view toggle (list vs map)
   - Search bar for city/cuisine
   - Filter chips: cuisine type, price range, certified, distance
   - Restaurant card: name, cuisine, rating stars, distance, halal certification badge
   - Restaurant detail: full info, reviews, directions button (opens native maps)
   - "Add Restaurant" FAB for community contributions

4. **Frontend — Integration:**
   - Link from mosque finder: "Halal restaurants near this mosque"
   - Link from settings → Islamic section
   - Add to navigation/tabs if appropriate

**Verification:**
- Open halal finder → see map with pins of nearby restaurants
- Tap restaurant → see detail with reviews
- Add new restaurant → appears on map
- Filter by cuisine → results filter correctly

**i18n keys (ALL 8 files):**
```
halal.finder: "Halal Finder"
halal.restaurants: "Halal Restaurants"
halal.nearYou: "Near You"
halal.mapView: "Map"
halal.listView: "List"
halal.addRestaurant: "Add Restaurant"
halal.certified: "Halal Certified"
halal.verified: "Community Verified"
halal.cuisineType: "Cuisine"
halal.priceRange: "Price Range"
halal.reviews: "Reviews"
halal.writeReview: "Write a Review"
halal.directions: "Get Directions"
halal.verifyHalal: "Verify Halal Status"
halal.distance: "{{distance}} km away"
```

---

### [ ] Task 19: Comprehensive Dua Collection

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/data/` — existing data files (hadiths.json, etc.)
- `apps/mobile/app/(screens)/dhikr-counter.tsx` — reference for Islamic content display

**What to implement:**

1. **Backend — Dua data and endpoints:**
   - Create `apps/api/src/modules/islamic/data/duas.json` with 100+ authentic duas:
     - Each dua: `{ id, category, arabicText, transliteration, translation: { en, ar, tr, ur, bn, fr, id, ms }, source, sourceRef }`
     - Categories: `morning`, `evening`, `eating`, `travel`, `sleep`, `waking`, `rain`, `anxiety`, `illness`, `gratitude`, `forgiveness`, `parents`, `protection`, `mosque`, `ramadan`, `hajj`, `general`
   - `GET /api/v1/islamic/duas?category=morning` — list duas by category
   - `GET /api/v1/islamic/duas/:id` — single dua with full details
   - `GET /api/v1/islamic/duas/daily` — random dua of the day (deterministic per date using hash)
   - `POST /api/v1/islamic/duas/:id/bookmark` — bookmark a dua
   - `GET /api/v1/islamic/duas/bookmarked` — user's bookmarked duas

2. **Frontend — Dua collection screen:**
   - Create `apps/mobile/app/(screens)/dua-collection.tsx`
   - Category grid: 15+ categories with icons and Arabic names
   - Tap category → list of duas in that category
   - Each dua card: Arabic text (large, proper font), transliteration, translation, source
   - Bookmark heart button per dua
   - Share button → generates beautiful card image with the dua text
   - Audio playback: optional pronunciation audio (use TTS as fallback)

3. **Frontend — Dua of the day widget:**
   - On home screen or morning briefing: "Dua of the Day" card
   - Shows Arabic text, transliteration, translation
   - Tap → opens full dua detail

4. **Navigation integration:**
   - Settings → Islamic → "Dua Collection"
   - Morning briefing screen (if exists)
   - Prayer times screen: relevant dua after each prayer

**Verification:**
- Browse duas by category → see 10+ duas per major category
- Bookmark a dua → appears in bookmarked list
- Share dua → generates shareable card

**i18n keys (ALL 8 files):**
```
duas.title: "Dua Collection"
duas.categories: "Categories"
duas.duaOfTheDay: "Dua of the Day"
duas.bookmark: "Bookmark"
duas.bookmarked: "Bookmarked Duas"
duas.shareDua: "Share Dua"
duas.source: "Source"
duas.morning: "Morning"
duas.evening: "Evening"
duas.eating: "Eating"
duas.travel: "Travel"
duas.sleep: "Sleep"
duas.rain: "Rain"
duas.anxiety: "Anxiety & Distress"
duas.illness: "Illness"
duas.gratitude: "Gratitude"
duas.forgiveness: "Forgiveness"
duas.protection: "Protection"
```

---

### [ ] Task 20: Fasting Tracker

**Files to read first:**
- `apps/mobile/app/(screens)/ramadan-mode.tsx`
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/gamification/gamification.service.ts`

**What to implement:**

1. **Backend — Fasting model:**
   - Add `FastingLog` model:
     ```
     model FastingLog {
       id        String   @id @default(cuid())
       userId    String
       date      DateTime @db.Date
       isFasting Boolean
       fastType  String   @default("ramadan") // ramadan, monday, thursday, ayyam-al-bid, arafat, ashura, qada, nafl
       reason    String?  // if not fasting: travel, illness, menstruation, other
       createdAt DateTime @default(now())
       @@unique([userId, date])
       @@index([userId, date])
     }
     ```

2. **Backend endpoints:**
   - `POST /api/v1/islamic/fasting/log` — log a fast (or not fasting with reason)
   - `GET /api/v1/islamic/fasting/log?month=2026-03` — get fasting log for a month
   - `GET /api/v1/islamic/fasting/stats` — streak count, total fasts this year, makeup count
   - `GET /api/v1/islamic/fasting/today` — get today's iftar/suhoor times (based on location + prayer calculation)
   - `GET /api/v1/islamic/fasting/qada` — number of unfasted Ramadan days that need makeup

3. **Frontend — Fasting tracker screen:**
   - Create `apps/mobile/app/(screens)/fasting-tracker.tsx`
   - Calendar view: month grid with colored days (green = fasted, red = missed, gray = future)
   - Today: "Are you fasting today?" prompt with Yes/No buttons
   - If not fasting: optional reason picker
   - Stats section: "Fasts this month: 18/30", "Current streak: 5 days", "Makeup needed: 3 days"
   - Iftar countdown: hours:minutes:seconds until iftar (prominent display)
   - Suhoor countdown: hours:minutes:seconds until suhoor ends

4. **Frontend — Optional fast tracking:**
   - Separate section for Sunnah fasts: Mondays, Thursdays, White Days (13-15 of each lunar month)
   - Calendar highlights Sunnah fast days
   - Quick toggle: "I'm fasting today" for Sunnah fasts

5. **Gamification integration:**
   - Award XP for fasting streaks: 10 XP per fast, 50 XP bonus for 7-day streak
   - Achievement: "30-Day Fast" badge for completing Ramadan
   - Achievement: "Monday & Thursday" for consistent Sunnah fasting

**Verification:**
- Log fast for today → calendar shows green
- Log 7 consecutive fasts → streak counter shows 7
- Iftar countdown displays correct time for user's location
- XP awarded for fasting streak

**i18n keys (ALL 8 files):**
```
fasting.tracker: "Fasting Tracker"
fasting.areYouFasting: "Are you fasting today?"
fasting.yesFasting: "Yes, I'm fasting"
fasting.notFasting: "Not fasting today"
fasting.reason: "Reason (optional)"
fasting.iftarIn: "Iftar in"
fasting.suhoorEndsIn: "Suhoor ends in"
fasting.streak: "Current Streak"
fasting.thisMonth: "This Month"
fasting.makeupNeeded: "Makeup Needed"
fasting.sunnahFasts: "Sunnah Fasts"
fasting.mondayThursday: "Monday & Thursday"
fasting.whiteDays: "White Days (13-15)"
fasting.totalThisYear: "Total Fasts This Year"
```

---

### [ ] Task 21: 99 Names of Allah — Interactive Learning

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/mobile/app/(screens)/dhikr-counter.tsx` — reference for counter UI

**What to implement:**

1. **Backend — Names data:**
   - Create `apps/api/src/modules/islamic/data/asma-ul-husna.json`:
     - 99 entries: `{ number, arabicName, transliteration, englishMeaning, explanation, quranRef? }`
     - Full Arabic calligraphy for each name
     - Detailed explanation (2-3 sentences per name)
     - Quran reference where the name appears (if applicable)
   - `GET /api/v1/islamic/names-of-allah` — all 99 names
   - `GET /api/v1/islamic/names-of-allah/daily` — today's name (cycle through 99 over days)
   - `GET /api/v1/islamic/names-of-allah/:number` — single name detail

2. **Frontend — 99 Names screen:**
   - Create `apps/mobile/app/(screens)/names-of-allah.tsx`
   - Grid of 99 cards, each showing Arabic name + transliteration
   - Tap card → expand to show full detail (meaning, explanation, Quran ref)
   - Audio pronunciation for each name (use TTS for Arabic)
   - Memorization tracker: mark each name as "learned" (stores in AsyncStorage)
   - Progress bar: "42/99 names learned"
   - "Daily Name" highlighted card at top
   - Dhikr mode: tap a name → counter for repeating that name

3. **Frontend — Sharing:**
   - Share individual name as beautiful card (Arabic calligraphy + meaning)
   - Share progress: "I've learned 42/99 Names of Allah on Mizanly"

**Verification:**
- Browse all 99 names → each has Arabic, transliteration, meaning, explanation
- Mark 5 as learned → progress shows 5/99
- Tap daily name → see detail with audio pronunciation
- Share a name → generates shareable card

**i18n keys (ALL 8 files):**
```
namesOfAllah.title: "99 Names of Allah"
namesOfAllah.dailyName: "Name of the Day"
namesOfAllah.learned: "Learned"
namesOfAllah.progress: "{{count}}/99 names learned"
namesOfAllah.markAsLearned: "Mark as Learned"
namesOfAllah.meaning: "Meaning"
namesOfAllah.explanation: "Explanation"
namesOfAllah.quranReference: "Quran Reference"
namesOfAllah.listen: "Listen"
namesOfAllah.dhikr: "Dhikr"
namesOfAllah.shareProgress: "Share Progress"
```

---

### [ ] Task 22: Quran Memorization (Hifz) Tracker

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/mobile/app/(screens)/quran-reading-plan.tsx`
- `apps/mobile/app/(screens)/quran-room.tsx`

**What to implement:**

1. **Backend — Hifz model:**
   ```
   model HifzProgress {
     id        String @id @default(cuid())
     userId    String
     surahNum  Int    // 1-114
     status    String // 'not_started' | 'in_progress' | 'memorized' | 'needs_review'
     lastReviewedAt DateTime?
     updatedAt DateTime @updatedAt
     @@unique([userId, surahNum])
   }
   ```

2. **Backend endpoints:**
   - `GET /api/v1/islamic/hifz/progress` — all 114 surahs with status
   - `PUT /api/v1/islamic/hifz/progress/:surahNum` — update status
   - `GET /api/v1/islamic/hifz/stats` — total memorized, in progress, percentage
   - `GET /api/v1/islamic/hifz/review-schedule` — surahs needing review (spaced repetition)

3. **Frontend — Hifz tracker screen:**
   - Create `apps/mobile/app/(screens)/hifz-tracker.tsx`
   - 30 juz view: visual segments colored by progress (memorized=emerald, in-progress=gold, not-started=gray)
   - 114 surahs list: name (Arabic + English), ayah count, status badge, last reviewed date
   - Tap surah → change status (not started → in progress → memorized → needs review)
   - Daily review section: "Review today" list based on spaced repetition
   - Stats: "42 surahs memorized (37%)", "Daily streak: 12 days"
   - Integration with Quran audio: play surah audio for practice
   - Link to Quran rooms: "Find a study partner"

**Verification:**
- Mark Surah Al-Fatiha as memorized → progress shows 1/114
- Mark 10 surahs → juz view shows partial coloring
- Review schedule suggests surahs not reviewed recently

**i18n keys (ALL 8 files):**
```
hifz.title: "Quran Memorization"
hifz.progress: "Progress"
hifz.memorized: "Memorized"
hifz.inProgress: "In Progress"
hifz.notStarted: "Not Started"
hifz.needsReview: "Needs Review"
hifz.reviewToday: "Review Today"
hifz.totalMemorized: "{{count}} surahs memorized"
hifz.lastReviewed: "Last reviewed {{date}}"
hifz.juzView: "Juz View"
hifz.surahView: "Surah View"
hifz.findStudyPartner: "Find Study Partner"
```

---

### [ ] Task 23: Prayer-Time-Aware Smart Features

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic-notifications.service.ts`
- `apps/mobile/app/(screens)/prayer-times.tsx`
- `apps/mobile/src/stores/index.ts`

**What to implement:**

1. **Backend — Prayer time awareness:**
   - `GET /api/v1/islamic/prayer-times/current-window` — returns: which prayer window we're currently in (e.g., "between Dhuhr and Asr"), minutes until next prayer
   - Use this to influence feed ranking (already built in Task 23 Batch 1 — verify and enhance)

2. **Frontend — Prayer-time notifications:**
   - Configurable per-prayer push notifications (Fajr, Dhuhr, Asr, Maghrib, Isha)
   - Each prayer independently toggleable in settings
   - Notification text: "It's time for Fajr prayer" with adhan sound option
   - 15-minute pre-prayer notification option: "Fajr in 15 minutes"

3. **Frontend — "Pray First" nudge:**
   - If user has been actively scrolling for 20+ minutes AND current time is within a prayer window:
   - Show gentle banner: "It's time for [Prayer Name]. Take a break and pray."
   - Banner is dismissible but reappears after 10 more minutes
   - Track: don't show more than 2 nudges per prayer time
   - Use `colors.emerald` background with mosque icon

4. **Frontend — Jummah mode (every Friday):**
   - On Fridays: special notification at Dhuhr time: "Jummah Mubarak! Find a mosque near you"
   - Link to mosque finder
   - Surah Al-Kahf reading reminder (morning notification): "Don't forget to read Surah Al-Kahf today"

5. **Frontend — Content boost during prayer times:**
   - 15 minutes before and after each prayer: feed shows more Islamic content
   - "After Fajr" section: morning adhkar, dua of the day
   - "After Maghrib" section: evening adhkar
   - These are feed injections, not separate screens

**Verification:**
- Enable Fajr notification → get notified at Fajr time
- Scroll for 20 min during Asr time → "Pray First" banner appears
- On Friday → Jummah notification with mosque finder link
- Feed shows more Islamic content near prayer times

**i18n keys (ALL 8 files):**
```
prayer.timeFor: "It's time for {{prayer}}"
prayer.in15Min: "{{prayer}} in 15 minutes"
prayer.prayFirst: "Take a break and pray"
prayer.prayFirstTitle: "Prayer Time"
prayer.jummahMubarak: "Jummah Mubarak!"
prayer.findMosque: "Find a mosque near you"
prayer.kahfReminder: "Don't forget Surah Al-Kahf today"
prayer.afterPrayerAdhkar: "After {{prayer}} Adhkar"
prayer.configurePrayers: "Prayer Notifications"
prayer.enableNotification: "Enable {{prayer}} notification"
```

---

### [ ] Task 24: Mosque Social Graph

**Files to read first:**
- `apps/mobile/app/(screens)/mosque-finder.tsx`
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/communities/communities.service.ts` — reference for community model

**What to implement:**

1. **Backend — Mosque community model:**
   ```
   model MosqueCommunity {
     id           String   @id @default(cuid())
     name         String
     address      String
     city         String
     country      String
     latitude     Float
     longitude    Float
     madhab       String?  // hanafi, shafi, maliki, hanbali
     language     String?
     phone        String?
     website      String?
     imageUrl     String?
     memberCount  Int      @default(0)
     createdById  String
     isVerified   Boolean  @default(false)
     createdAt    DateTime @default(now())
     @@index([latitude, longitude])
     @@index([city])
   }

   model MosqueMembership {
     id        String   @id @default(cuid())
     mosqueId  String
     userId    String
     role      String   @default("member") // member, admin, imam
     createdAt DateTime @default(now())
     @@unique([mosqueId, userId])
   }

   model MosquePost {
     id        String   @id @default(cuid())
     mosqueId  String
     userId    String
     content   String
     mediaUrls String[]
     isPinned  Boolean  @default(false)
     createdAt DateTime @default(now())
     @@index([mosqueId, createdAt(sort: Desc)])
   }
   ```

2. **Backend endpoints:**
   - `GET /api/v1/mosques/nearby?lat=X&lng=Y` — find nearby mosques
   - `POST /api/v1/mosques` — create mosque page
   - `POST /api/v1/mosques/:id/join` — join mosque community
   - `DELETE /api/v1/mosques/:id/leave` — leave
   - `GET /api/v1/mosques/:id/feed` — mosque feed (announcements, community posts)
   - `POST /api/v1/mosques/:id/posts` — post to mosque feed (members only)
   - `GET /api/v1/mosques/:id/members` — list members
   - `GET /api/v1/mosques/my` — user's mosque memberships

3. **Frontend — Mosque community screen:**
   - Mosque profile header: name, image, address, madhab, member count
   - Feed: announcements and community posts
   - Members tab: list of members with roles
   - Events tab: upcoming events at this mosque
   - "Join" button for non-members
   - Admin tools: post announcements, pin posts, manage members
   - Link from mosque finder: "Join Community" button on each mosque

**Verification:**
- Create mosque → appears in nearby search
- Join mosque → see community feed
- Post announcement → all members can see it
- User can belong to multiple mosques

**i18n keys (ALL 8 files):**
```
mosque.community: "Mosque Community"
mosque.join: "Join Community"
mosque.leave: "Leave Community"
mosque.members: "Members"
mosque.announcements: "Announcements"
mosque.postUpdate: "Post Update"
mosque.admin: "Admin"
mosque.imam: "Imam"
mosque.myMosques: "My Mosques"
mosque.nearbyMosques: "Nearby Mosques"
mosque.madhab: "Madhab"
mosque.createMosque: "Create Mosque Page"
```

---

### [ ] Task 25: Islamic Scholar Live Q&A System

**Files to read first:**
- `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
- `apps/api/src/modules/live/` — live streaming
- `apps/mobile/app/(screens)/audio-room.tsx`
- `apps/mobile/app/(screens)/scholar-verification.tsx`

**What to implement:**

1. **Backend — Q&A session model:**
   ```
   model ScholarQA {
     id          String   @id @default(cuid())
     scholarId   String   // verified scholar
     title       String
     description String?
     category    String   // fiqh, aqeedah, tafsir, seerah, family, youth, women, converts
     language    String   @default("en")
     scheduledAt DateTime
     startedAt   DateTime?
     endedAt     DateTime?
     recordingUrl String?
     status      String   @default("scheduled") // scheduled, live, ended
     createdAt   DateTime @default(now())
     @@index([scheduledAt])
     @@index([scholarId])
   }

   model ScholarQuestion {
     id        String   @id @default(cuid())
     qaId      String   // FK to ScholarQA
     userId    String
     question  String
     votes     Int      @default(0)
     isAnswered Boolean @default(false)
     answeredAt DateTime?
     createdAt DateTime @default(now())
     @@index([qaId, votes(sort: Desc)])
   }
   ```

2. **Backend endpoints:**
   - `POST /api/v1/scholar-qa` — schedule Q&A (verified scholars only)
   - `GET /api/v1/scholar-qa/upcoming` — upcoming sessions
   - `GET /api/v1/scholar-qa/:id` — session detail with questions
   - `POST /api/v1/scholar-qa/:id/questions` — submit question
   - `POST /api/v1/scholar-qa/:id/questions/:qid/vote` — upvote question
   - `PUT /api/v1/scholar-qa/:id/start` — start session (scholar only)
   - `PUT /api/v1/scholar-qa/:id/questions/:qid/answered` — mark answered
   - `GET /api/v1/scholar-qa/recordings` — past sessions with recordings

3. **Frontend — Q&A screens:**
   - Upcoming sessions list with scholar info, topic, time
   - Session detail: question list (sorted by votes), submit question button
   - During live: audio room integration, question queue visible, scholar picks from top-voted
   - After session: recording available, answered questions highlighted

**Verification:**
- Scholar schedules Q&A → appears in upcoming list
- Users submit questions → can vote → most voted rises to top
- Scholar goes live → answers questions → session recorded
- Recording accessible after session ends

**i18n keys (ALL 8 files):**
```
scholarQA.title: "Scholar Q&A"
scholarQA.upcoming: "Upcoming Sessions"
scholarQA.askQuestion: "Ask a Question"
scholarQA.submitQuestion: "Submit Question"
scholarQA.voteQuestion: "Vote"
scholarQA.answered: "Answered"
scholarQA.live: "Live Now"
scholarQA.recording: "Recording"
scholarQA.schedule: "Schedule Q&A"
scholarQA.startSession: "Start Session"
scholarQA.endSession: "End Session"
scholarQA.pastSessions: "Past Sessions"
```

---

### [ ] Task 26: Islamic Calendar Theming

**Files to read first:**
- `apps/mobile/src/theme/index.ts`
- `apps/mobile/src/utils/hijri.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(screens)/ramadan-mode.tsx`
- `apps/mobile/app/(screens)/islamic-calendar.tsx`

**What to implement:**

1. **Theme overlay system:**
   - Create `apps/mobile/src/theme/islamicThemes.ts`:
     - `ramadan`: crescent accents, warm gold highlights, lantern decorations
     - `eid`: celebration mode — gold + emerald, festive
     - `dhulhijjah`: Hajj season — Kaaba-inspired, earth tones
     - `muharram`: subdued, reflective, silver accents
     - `jummah`: subtle gold accent on app bar (every Friday)
   - Each theme overrides specific color tokens: accent color, header background, icon tints
   - Theme activates automatically based on Hijri calendar date

2. **Frontend — Theme activation:**
   - In `_layout.tsx` or theme provider: check Hijri date on app load
   - If Ramadan: apply `ramadan` theme overlay
   - If 1-3 Shawwal (Eid al-Fitr): apply `eid` theme
   - If 1-13 Dhul Hijjah: apply `dhulhijjah` theme
   - If 10 Dhul Hijjah (Eid al-Adha): apply `eid` theme
   - If 1 Muharram: apply `muharram` theme (1 day)
   - If Friday: apply subtle `jummah` tint to header

3. **Frontend — Eid celebration:**
   - On Eid day first app open: confetti/particle animation overlay (3 seconds, then dismiss)
   - "Eid Mubarak" banner on home screen (dismissible)
   - Link to Eid cards creation screen

4. **User control:**
   - Settings → Appearance → "Islamic Calendar Themes" toggle (on by default)
   - When off: no automatic theme changes

**Verification:**
- During Ramadan: app has warm gold accents (verify with mocked Hijri date)
- On Eid: confetti animation on open, festive colors
- On Friday: subtle gold header tint
- Toggle off → normal theme regardless of date

**i18n keys (ALL 8 files):**
```
themes.islamicCalendar: "Islamic Calendar Themes"
themes.islamicCalendarDescription: "App appearance changes during Islamic occasions"
themes.ramadan: "Ramadan Theme"
themes.eid: "Eid Celebration"
themes.dhulhijjah: "Dhul Hijjah Theme"
themes.eidMubarak: "Eid Mubarak!"
themes.ramadanKareem: "Ramadan Kareem"
```

---

## SECTION 3: MONETIZATION & CREATOR ECONOMY (Tasks 27-29)

---

### [ ] Task 27: Virtual Currency Economy (Coins → Gifts → Diamonds → Cash)

**Files to read first:**
- `apps/api/src/modules/gifts/gifts.service.ts`
- `apps/api/src/modules/payments/payments.service.ts`
- `apps/api/src/modules/monetization/monetization.service.ts`
- `apps/mobile/app/(screens)/gift-shop.tsx`
- `apps/mobile/app/(screens)/send-tip.tsx`

**What to implement:**

1. **Backend — Currency models:**
   ```
   model CoinBalance {
     id      String @id @default(cuid())
     userId  String @unique
     coins   Int    @default(0)
   }

   model CoinPurchase {
     id            String   @id @default(cuid())
     userId        String
     coins         Int
     amountPaidUsd Float
     stripePaymentId String
     createdAt     DateTime @default(now())
   }

   model GiftTransaction {
     id           String   @id @default(cuid())
     senderId     String
     recipientId  String
     giftType     String   // rose, crown, universe, crescent, mosque, quran, lantern
     coinCost     Int
     diamondValue Int      // creator receives this many diamonds
     contentType  String?  // post, reel, live
     contentId    String?
     createdAt    DateTime @default(now())
     @@index([recipientId, createdAt(sort: Desc)])
   }

   model DiamondBalance {
     id       String @id @default(cuid())
     userId   String @unique
     diamonds Int    @default(0)
   }
   ```

2. **Backend endpoints:**
   - `POST /api/v1/coins/purchase` — buy coins (Stripe payment → add coins)
   - `GET /api/v1/coins/balance` — get coin balance
   - `POST /api/v1/gifts/send` — send gift (deduct coins from sender, add diamonds to creator)
   - `GET /api/v1/diamonds/balance` — get diamond balance
   - `POST /api/v1/diamonds/cashout` — convert diamonds to money (via Stripe Connect)
   - `GET /api/v1/gifts/received` — gifts received by creator
   - Coin packs: `{ 100: $0.99, 500: $4.99, 1000: $9.99, 5000: $49.99 }`
   - Revenue split: 70% to creator (in diamonds), 30% platform fee
   - Gift types with costs: Rose=1, Star=5, Crown=50, Crescent=100, Mosque=500, Universe=1000

3. **Frontend — Coin purchase flow:**
   - In gift-shop screen: coin balance at top, pack options below
   - Tap pack → Stripe payment sheet → coins added instantly
   - Balance updates optimistically

4. **Frontend — Gift sending:**
   - On posts, reels, live streams: gift button
   - Tap → grid of gift options with coin costs
   - Select gift → deduct coins → show gift animation on content
   - Gift animations: floating/expanding icon with particle effects

5. **Frontend — Creator cashout:**
   - In revenue screen: diamond balance, conversion rate (1000 diamonds = $5)
   - "Cash Out" button → minimum $10 → Stripe Connect transfer
   - Transaction history

**Verification:**
- Buy 100 coins → balance shows 100
- Send Rose gift (1 coin) → sender: 99 coins, creator: diamonds increase
- Creator cashes out → money appears in Stripe Connect dashboard

**i18n keys (ALL 8 files):**
```
coins.balance: "Coin Balance"
coins.buy: "Buy Coins"
coins.pack: "{{count}} Coins"
coins.price: "{{price}}"
gifts.send: "Send Gift"
gifts.rose: "Rose"
gifts.crown: "Crown"
gifts.crescent: "Crescent"
gifts.mosque: "Mosque"
gifts.universe: "Universe"
gifts.received: "Gifts Received"
diamonds.balance: "Diamond Balance"
diamonds.cashout: "Cash Out"
diamonds.minimumCashout: "Minimum cashout: {{amount}}"
diamonds.conversionRate: "{{diamonds}} diamonds = {{money}}"
```

---

### [ ] Task 28: Stripe Connect for Creator Payouts

**(Can be combined with Task 27 if Stripe Connect is not yet set up)**

**Files to read first:**
- `apps/api/src/modules/monetization/stripe-connect.service.ts`
- `apps/api/src/modules/payments/payments.service.ts`
- `apps/mobile/app/(screens)/cashout.tsx`
- `apps/mobile/app/(screens)/revenue.tsx`

**What to implement:**

1. **Backend — Stripe Connect onboarding:**
   - `POST /api/v1/monetization/connect/onboard` — create Stripe Connect account for creator
   - Returns onboarding URL → creator completes identity verification in browser
   - Webhook handler for `account.updated` → update creator's payout status
   - `GET /api/v1/monetization/connect/status` — check if creator is onboarded

2. **Backend — Payout processing:**
   - `POST /api/v1/monetization/payout` — trigger payout (diamonds → money → Stripe transfer)
   - Minimum: $10 (equivalent in diamonds)
   - Automatic weekly payouts for balances > $100 (background job)
   - `GET /api/v1/monetization/payout-history` — list of past payouts

3. **Frontend — Creator payout flow:**
   - In revenue screen: "Set Up Payouts" if not onboarded → opens Stripe onboarding
   - Once onboarded: "Cash Out" button, payout history, pending balance
   - Stats: total earned all-time, this month, last payout date

**Verification:**
- Creator completes Stripe Connect onboarding → status shows "ready"
- Cash out $10 → money transferred (in test mode: verify Stripe dashboard)
- Payout history shows transaction

---

### [ ] Task 29: Promoted Posts / Self-Serve Ads

**Files to read first:**
- `apps/mobile/app/(screens)/boost-post.tsx`
- `apps/api/src/modules/promotions/promotions.service.ts`
- `apps/api/src/modules/promotions/promotions.controller.ts`

**What to implement:**

1. **Backend — Promotion model enhancement:**
   - Ensure promotion model has: `postId, userId, budget, dailyBudget, targetLocations, targetAgeMin, targetAgeMax, targetInterests, targetLanguages, impressions, clicks, status (draft/review/active/paused/ended), startDate, endDate`
   - `POST /api/v1/promotions` — create promotion campaign
   - `PUT /api/v1/promotions/:id/review` — submit for review
   - `GET /api/v1/promotions/:id/stats` — impressions, clicks, CTR, spend
   - Promotion delivery: inject promoted posts into feed with "Sponsored" label
   - Budget tracking: decrement budget per impression (CPM) or click (CPC)
   - Auto-pause when budget exhausted

2. **Frontend — Boost post screen:**
   - Budget selector: daily budget slider ($1-$100)
   - Duration: 1-30 days
   - Target audience: location (country/city picker), age range slider, interest tags, language
   - Preview: "Your post will reach ~X-Y people"
   - Payment: Stripe
   - Review status: "Under Review" / "Active" / "Paused"
   - Stats dashboard: impressions, clicks, CTR, total spend

3. **Feed integration:**
   - Promoted posts appear in feed with "Sponsored" label
   - Max 1 promoted post per 20 organic posts
   - Islamic ad policy check: auto-reject promotions for haram content

**Verification:**
- Boost a post with $10 budget → status: "Under Review"
- After approval: post appears in feed with "Sponsored" label for target audience
- Budget exhausted → promotion auto-pauses

---

## SECTION 4: RETENTION & ENGAGEMENT (Tasks 30-32)

---

### [ ] Task 30: Push Notification Intelligence

**(Depends on Task 1 BullMQ being completed)**

**What to implement:** Smart notification triggers — see Batch 2 design doc section 2.4.1 for full specification. Key notifications:
- "Your reel got 1,000 views!" (creator vanity)
- "Don't lose your 7-day streak!" (gamification)
- "5 people from your community joined" (social proof)
- Morning Islamic digest (prayer times + hadith)
- Weekly analytics summary for creators
- Prayer time reminders (per-prayer configurable)
- Smart timing: no notifications during prayer times or after 10 PM
- Frequency cap: max 10/day

---

### [ ] Task 31: Continue Watching & Smart Resume

**What to implement:** Track watch progress, "Continue Watching" row, resume from timestamp. See Batch 2 design doc section 2.4.2.

---

### [ ] Task 32: Daily Islamic Engagement Loop

**What to implement:** Morning briefing, daily dhikr challenge, daily ayah, community leaderboard, reflection prompt, completion rewards. See Batch 2 design doc section 2.4.3.

---

## SECTION 5: COMMUNITY FEATURES (Tasks 33-35)

---

### [ ] Task 33: Community Notes for Islamic Content

**What to implement:** Crowd-sourced fact-checking adapted for Islamic content. See Batch 2 design doc section 2.5.1.

---

### [ ] Task 34: Collaborative Posts (Collab)

**What to implement:** Co-authored posts appearing on both profiles. See Batch 2 design doc section 2.5.2.

---

### [ ] Task 35: Checklists in Messages

**What to implement:** Shared to-do lists within conversations with real-time sync. See Batch 2 design doc section 2.5.3.

---

## SECTION 6: INFRASTRUCTURE FOR SCALE (Tasks 36-38)

---

### [ ] Task 36: Meilisearch Full Integration

**Files to read first:**
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/docker-compose.yml` (if exists)
- `apps/mobile/app/(screens)/search.tsx`

**What to implement:**

1. **Meilisearch setup:**
   - Deploy Meilisearch instance (Meilisearch Cloud or Docker)
   - Install `meilisearch` npm package in `apps/api`
   - Configure connection in `apps/api/src/config/`

2. **Index content:**
   - Indexes: `users`, `posts`, `threads`, `reels`, `videos`, `hashtags`, `mosques`, `duas`
   - Sync on create/update/delete (via background job queue if available, or synchronous)
   - Each document: id + searchable text fields + filterable attributes

3. **Search endpoint update:**
   - Replace Prisma `contains` queries with Meilisearch queries
   - Typo tolerance: "Alhamduliilah" → finds "Alhamdulillah"
   - Faceted search: filter by content type, space, language
   - Arabic-aware: proper tokenization for Arabic text

4. **Frontend — Search improvements:**
   - Search suggestions as user types (instant results)
   - Recent searches (stored in AsyncStorage)
   - Trending searches section
   - Federated results: users, posts, threads, videos in tabs

**Verification:**
- Search "quran tafsir" → relevant results in <100ms
- Search with typo "mohmmad" → finds "Mohammad"
- Arabic search works correctly

---

### [ ] Task 37: WebSocket Clustering (Redis Adapter)

**What to implement:** Socket.io Redis adapter for multi-instance support. See Batch 2 design doc section 2.6.2.

---

### [ ] Task 38: Database Float→Decimal for Money

**What to implement:** Migrate money fields from Float to Decimal. See Batch 2 design doc section 2.6.3.

---

## SECTION 7: BRANDING & LAUNCH (Tasks 39-41)

---

### [ ] Task 39: App Icon & Splash Screen

**What to implement:**
1. Design app icon: emerald background, gold accent, simple geometric pattern or Arabic "م" letterform
2. Generate icon sizes for iOS (1024x1024) and Android (adaptive: 108x108dp foreground + background)
3. Animated splash screen with Lottie or Reanimated: emerald gradient → logo fade-in → transition to app
4. Configure in `app.json` / `app.config.js`: `icon`, `splash`, `android.adaptiveIcon`

---

### [ ] Task 40: Custom Notification Sounds

**What to implement:**
1. Create/source 4 short audio files (<1 second each):
   - Default notification: subtle chime
   - Message received: soft ping
   - Achievement: celebratory tone
   - Prayer reminder: brief melodic note (not full adhan — that's separate)
2. Bundle in `apps/mobile/assets/sounds/`
3. Configure in notification channel setup (Android) and notification options (iOS)

---

### [ ] Task 41: App Store Description & Metadata

**What to implement:**
1. Short description (80 chars): "The social platform for the global Muslim Ummah"
2. Long description (4000 chars): cover all 5 spaces, Islamic features, privacy, languages
3. Keywords list: islamic, muslim, quran, prayer, halal, social, ummah, community
4. Privacy policy page URL (required for App Store)
5. Category: Social Networking
6. Age rating: 12+ (user-generated content)
7. Store these in `apps/mobile/app-store-metadata/` for easy access during submission

---

## SECTION 8: REMAINING FROM DESIGN DOC (Tasks 42-50)

These are additional items from the mega-batch design doc that weren't covered above. They are lower priority but needed for true 10/10.

---

### [ ] Task 42: Collaborative Posts implementation (detailed)
### [ ] Task 43: Community Notes implementation (detailed)
### [ ] Task 44: Continue Watching implementation (detailed)
### [ ] Task 45: Daily Islamic Engagement Loop implementation (detailed)
### [ ] Task 46: Push Notification Intelligence implementation (detailed)
### [ ] Task 47: Checklists in Messages implementation (detailed)
### [ ] Task 48: WebSocket Clustering implementation (detailed)
### [ ] Task 49: Float→Decimal Migration implementation (detailed)
### [ ] Task 50: Final Quality Audit & Score Reassessment

**Task 50 — MANDATORY FINAL STEP:**
After all other tasks are complete, run a comprehensive audit:
1. Run full test suite: target 0 failures
2. Check for `as any` in non-test code: target 0
3. Check all 8 i18n files have identical key counts
4. Verify all new screens have: Skeleton loading, EmptyState, RefreshControl, error handling, a11y labels
5. Count total: screens, modules, models, tests, lines of code
6. Update CLAUDE.md with accurate metrics
7. Update docs/PARITY_SCORES_BATCH85.md with new honest scores
8. Commit final state

---

## PROGRESS LOG

### Completed:
(none yet)

### Blocked:
(carry forward from Batch 1)

---

*Remember: Read `docs/ralph-instructions.md` for behavioral rules. NEVER stop. NEVER shortcut. VERIFY everything.*
