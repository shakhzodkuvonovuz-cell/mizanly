# RALPH — Batch 3 Task Manifest: "CLOSE EVERY GAP"
## 30 tasks. Covers all half-done, skipped, and missing items from Batch 1 & 2 audit.

> **Read `docs/ralph-instructions.md` first.** Behavioral rules still apply.
> **Read `CLAUDE.md` second.** Codebase rules, architecture, and component patterns.
> **Then start executing tasks below in order.**

> **CONTEXT:** An honest audit found Batch 1+2 were 65% truly complete, 20% half-done, 15% missing.
> This batch closes every gap. No new features. Just finishing what was started and fixing what was skipped.

---

## SECTION 1: CRITICAL GAPS — Things that are completely broken or fake (Tasks 1-5)

---

### [ ] Task 1: Install react-native-maps and fix Halal Finder + Mosque Finder

**Problem:** `halal-finder.tsx` (357 lines) and `mosque-finder.tsx` reference MapView but `react-native-maps` is NOT in package.json. Both screens will crash on launch.

**Pre-requisite:** Run `npm install react-native-maps` in `apps/mobile`. If npm is not in shell PATH, mark BLOCKED.

**What to implement:**

1. **Install the package:**
   - `cd apps/mobile && npm install react-native-maps`
   - Verify it appears in package.json

2. **Fix halal-finder.tsx:**
   - Read the file completely
   - Verify `MapView` and `Marker` are imported from `react-native-maps`
   - Verify map renders with restaurant pins at `latitude`/`longitude` from API response
   - Add fallback: if location permission denied, show list view only (no crash)
   - Verify the screen has: Skeleton loading, EmptyState, RefreshControl, error handling

3. **Fix mosque-finder.tsx:**
   - Same as above — verify MapView works, pins render, fallback if no location permission

4. **Location permission:**
   - Verify `expo-location` is installed and permission is requested before accessing coordinates
   - If not installed: `npm install expo-location`
   - Handle permission denied gracefully — show "Enable location to find nearby" message

**Verification:**
- Open halal-finder → map renders (or graceful fallback if no maps API key)
- Open mosque-finder → map renders
- No crashes on either screen

---

### [ ] Task 2: Float → Decimal Migration for Money Fields

**Problem:** 10 money fields use `Float` which causes precision errors. $19.99 + $0.01 might not equal $20.00.

**Files to read first:**
- `apps/api/prisma/schema.prisma` — find all Float fields related to money
- Any service that does arithmetic on these fields

**What to implement:**

1. **Change these fields in schema.prisma from `Float` to `Decimal`:**
   - Search for all `Float` fields — identify which are money-related:
     - `amount Float` → `amount Decimal`
     - `price Float` → `price Decimal`
     - `budget Float` → `budget Decimal`
     - `totalAmount Float` → `totalAmount Decimal`
     - `goalAmount Float` → `goalAmount Decimal`
     - `raisedAmount Float` → `raisedAmount Decimal`
   - Leave non-money Float fields (like `latitude`, `longitude`, `averageRating`) as Float — those are fine

2. **Create migration:**
   - Run `npx prisma format` to validate schema
   - Create a migration with the changes
   - If migration tool isn't available, document the SQL: `ALTER TABLE ... ALTER COLUMN ... TYPE DECIMAL(12,2);`

3. **Update services:**
   - Prisma returns Decimal as `Prisma.Decimal` objects, not plain numbers
   - Any service that reads these fields needs to handle Decimal:
     - Use `.toNumber()` when passing to calculations
     - Or use `Number()` conversion
   - Search for `.amount`, `.price`, `.budget` usage in services and fix any type errors

4. **Update DTOs:**
   - Any DTO that accepts money values should use `@IsNumber()` validation (already likely in place)

**Verification:**
- `npx prisma format` passes
- No TypeScript errors from the Decimal change
- Run relevant test suites → still passing

---

### [ ] Task 3: Daily Islamic Engagement Loop (Morning Briefing)

**Problem:** Zero code exists. grep found nothing for morning briefing, daily dhikr challenge, daily ayah, or engagement loop. This was in Batch 2 Task 32 but was completely skipped.

**Files to read first:**
- `apps/api/src/modules/islamic/islamic.service.ts` — existing Islamic endpoints
- `apps/api/src/modules/gamification/gamification.service.ts` — XP/streak logic
- `apps/mobile/app/(screens)/prayer-times.tsx` — reference for Islamic UI

**What to implement:**

1. **Backend — Daily briefing endpoint:**
   - `GET /api/v1/islamic/daily-briefing` — returns:
     ```json
     {
       "prayerTimes": { "fajr": "5:12", "dhuhr": "12:15", ... },
       "hadithOfTheDay": { "text": "...", "source": "Bukhari 1234" },
       "ayahOfTheDay": { "arabic": "...", "translation": "...", "surah": "Al-Baqarah", "ayah": 255 },
       "duaOfTheDay": { "arabic": "...", "translation": "...", "category": "morning" },
       "dhikrChallenge": { "text": "SubhanAllah", "target": 33, "completed": 12, "streakDays": 5 },
       "hijriDate": "15 Ramadan 1447",
       "tasksCompleted": 1,
       "totalTasks": 3
     }
     ```
   - Daily items are deterministic per date (hash of date → index into collection)
   - `dhikrChallenge` pulls from user's daily progress (new model or use existing dhikr tracking)

2. **Backend — Daily task tracking:**
   - Add `DailyTask` model (or reuse existing gamification):
     ```
     model DailyTaskCompletion {
       id        String   @id @default(cuid())
       userId    String
       date      DateTime @db.Date
       taskType  String   // 'dhikr' | 'quran' | 'reflection'
       createdAt DateTime @default(now())
       @@unique([userId, date, taskType])
     }
     ```
   - `POST /api/v1/islamic/daily-tasks/complete` — body: `{ taskType: 'dhikr' | 'quran' | 'reflection' }`
   - `GET /api/v1/islamic/daily-tasks/today` — returns which tasks are completed today
   - Completing all 3 tasks awards bonus XP (50 XP via gamification service)

3. **Frontend — Morning briefing screen:**
   - Create `apps/mobile/app/(screens)/morning-briefing.tsx`
   - Header: Hijri date + greeting ("Good morning" / "Sabah al-Khair")
   - Prayer times card (compact, next prayer highlighted)
   - Ayah of the day card (Arabic + translation, tap to expand tafsir)
   - Hadith of the day card
   - Daily tasks section:
     - Dhikr challenge: "Say SubhanAllah 33 times" with progress ring + counter button
     - Quran reading: "Read today's ayah" with checkmark
     - Daily reflection: "What are you grateful for?" with text input (saves as private post or just marks complete)
   - Progress: "2/3 tasks complete" with XP reward preview
   - All cards use proper design tokens, Skeleton loading, i18n

4. **Navigation:**
   - Link from home screen / tab bar — could be a floating card at top of Saf feed
   - Or accessible from Settings → Islamic

**Verification:**
- Open morning briefing → prayer times, hadith, ayah, dhikr challenge all display
- Complete dhikr challenge (tap counter 33 times) → task marked complete → XP awarded
- Complete all 3 → bonus XP

**i18n keys (ALL 8 files):**
```
dailyBriefing.title: "Morning Briefing"
dailyBriefing.greeting: "Good Morning"
dailyBriefing.ayahOfTheDay: "Ayah of the Day"
dailyBriefing.hadithOfTheDay: "Hadith of the Day"
dailyBriefing.dhikrChallenge: "Dhikr Challenge"
dailyBriefing.dailyReflection: "Daily Reflection"
dailyBriefing.tasksComplete: "{{completed}}/{{total}} tasks complete"
dailyBriefing.bonusXP: "Complete all for +{{xp}} XP"
dailyBriefing.gratefulPrompt: "What are you grateful for today?"
dailyBriefing.completed: "Completed!"
```

---

### [ ] Task 4: Wire Islamic Calendar Theming into App Layout

**Problem:** `islamicThemes.ts` (103 lines) exists with 5 theme overlays but it's NOT wired into `_layout.tsx`. The themes never activate.

**Files to read first:**
- `apps/mobile/src/theme/islamicThemes.ts` (read completely)
- `apps/mobile/app/_layout.tsx` (read completely)
- `apps/mobile/src/utils/hijri.ts` — Hijri date calculation
- `apps/mobile/src/stores/index.ts` — Zustand store

**What to implement:**

1. **Add Islamic theme state to Zustand store:**
   - `islamicThemeOverride: string | null` — active Islamic theme name or null
   - `islamicThemeEnabled: boolean` — user toggle (default true)
   - `setIslamicThemeEnabled(enabled: boolean)` — setter

2. **Create a theme resolver hook:**
   - `apps/mobile/src/hooks/useIslamicTheme.ts`:
   - On app load: check current Hijri date
   - If Ramadan (month 9): return 'ramadan' theme
   - If 1-3 Shawwal: return 'eid' theme
   - If 1-13 Dhul Hijjah: return 'dhulhijjah' theme
   - If 10 Dhul Hijjah: return 'eid' theme (overrides dhulhijjah)
   - If 1 Muharram: return 'muharram' theme
   - If Friday: return 'jummah' theme (subtle, just accent tint)
   - Otherwise: return null (no override)
   - Respect `islamicThemeEnabled` — if off, always return null

3. **Wire into _layout.tsx:**
   - Import the hook
   - Get the active Islamic theme
   - If active: merge theme overrides into the color provider context
   - This should affect: header background, accent colors, subtle tints — NOT break the core dark mode

4. **Eid celebration on app open:**
   - If Eid theme is active AND it's the first app open today:
   - Show a brief celebration overlay (confetti or sparkle animation, 2 seconds, auto-dismiss)
   - Store `lastEidCelebrationDate` in AsyncStorage to show only once per day

5. **Settings toggle:**
   - In Settings → Islamic section: "Islamic Calendar Themes" toggle
   - When off: no automatic theme changes

**Verification:**
- Mock Hijri date to Ramadan → app shows warm gold accents
- Mock to Eid → confetti on first open, festive colors
- Mock to Friday → subtle gold header tint
- Toggle off in settings → normal theme regardless of date
- Regular non-occasion day → no theme change

---

### [ ] Task 5: E2E Encryption — Key Change Notifications

**Problem:** Safety numbers are computed but key change notifications were NOT implemented. When a user re-registers their encryption key (new device), conversation partners are not notified.

**Files to read first:**
- `apps/api/src/modules/encryption/encryption.service.ts`
- `apps/api/src/modules/encryption/encryption.controller.ts`
- `apps/api/src/gateways/chat.gateway.ts`

**What to implement:**

1. **Backend — Detect key change on re-registration:**
   - In `registerKey()`: check if user already has a key registered
   - If existing key exists AND new key is different from existing:
     - Find all conversations this user is part of
     - For each conversation: create a system message: "Security code changed for [username]. Tap to verify."
     - Emit socket event `security_code_changed` to conversation members

2. **Backend — System message type:**
   - Add `'system_security'` to valid messageType values (if not exists)
   - System messages have `senderId: null` or a sentinel system user ID

3. **Frontend — Display in conversation:**
   - In MessageBubble: if `message.messageType === 'system_security'`:
     - Render as a centered gray banner (like WhatsApp's "Messages are end-to-end encrypted" banner)
     - Text: "Security code changed for [name]. Tap to verify."
     - Tap → navigate to `verify-encryption` screen with that user

**Verification:**
- User A and B are in a conversation, both have encryption keys
- User A registers a new key (simulating new device)
- User B sees "Security code changed" banner in the conversation
- Tapping it opens verify-encryption screen

**i18n keys (ALL 8 files):**
```
encryption.securityCodeChanged: "Security code changed for {{name}}"
encryption.tapToVerify: "Tap to verify"
encryption.newKeyRegistered: "Your encryption keys have been updated"
```

---

## SECTION 2: HALF-DONE ITEMS — Finish what was started (Tasks 6-17)

---

### [ ] Task 6: Verify BullMQ Job Wiring

**Problem:** BullMQ queues and processors exist but it's unverified whether post creation, follows, and other events actually enqueue jobs.

**Files to read first:**
- `apps/api/src/common/queue/queue.service.ts`
- `apps/api/src/modules/posts/posts.service.ts` — look for queue.add() calls
- `apps/api/src/modules/follows/follows.service.ts`
- `apps/api/src/modules/messages/messages.service.ts`
- `apps/api/src/modules/reels/reels.service.ts`

**What to implement:**

1. **Audit each service for queue integration:**
   - Post creation → should enqueue: `notification` job (notify followers), `media` job (BlurHash), `search-indexing` job
   - Follow → should enqueue: `notification` job (notify followed user)
   - Message send → should enqueue: `notification` job (push to recipient)
   - Reel creation → should enqueue: `notification` + `media` + `search-indexing`
   - Content report → should enqueue: `ai-tasks` job (moderation check)

2. **For each service that doesn't enqueue:**
   - Inject `QueueService` into the constructor
   - Add `this.queueService.addJob('queue-name', 'job-type', { ...data })` after the main operation
   - Ensure the job is added AFTER the database write succeeds (not before)

3. **Verify processors handle the jobs:**
   - Read each processor file
   - Ensure the `process()` method actually does work (not just logging)
   - Notification processor should call `PushService.sendToUser()`
   - Media processor should generate BlurHash (if sharp is available)

**Verification:**
- Read post creation code → queue.add() call is present
- Read follow code → queue.add() call is present
- Check that processors have real logic, not just `console.log`

---

### [ ] Task 7: Verify Per-User Rate Limiting Coverage

**Problem:** `UserThrottlerGuard` exists but may not be applied to all controllers.

**Files to read first:**
- `apps/api/src/common/guards/` — find the throttler guard
- Sample 10 controllers and check for `@UseGuards(ThrottlerGuard)` or `@Throttle()`

**What to implement:**

1. **Audit all controllers:**
   - List all controller files: `find apps/api/src/modules -name "*.controller.ts"`
   - For each: check if it has `@UseGuards(ThrottlerGuard)` or per-endpoint `@Throttle()`
   - Record which controllers are missing rate limiting

2. **Apply rate limiting to any unprotected controller:**
   - Add `@UseGuards(ThrottlerGuard)` at the class level or per-endpoint `@Throttle()` decorators
   - Use appropriate limits per endpoint type (from ralph-batch1 Task 28 spec)

3. **Verify response headers:**
   - Check that rate limit headers (`X-RateLimit-Remaining`, etc.) are sent
   - If not implemented in the guard, add them

**Verification:**
- All controllers have rate limiting
- No endpoint is unprotected

---

### [ ] Task 8: Live Rehearsal — Verify Implementation

**Problem:** Commit says done but `isRehearsal` field and transition logic need verification.

**Files to read first:**
- `apps/api/prisma/schema.prisma` — search for LiveStream or equivalent model
- `apps/api/src/modules/live/` — all files
- `apps/mobile/app/(screens)/go-live.tsx`

**What to implement:**

1. **Verify schema:** `isRehearsal: Boolean @default(false)` exists on live stream model
2. **Verify endpoints:** `PUT /live/:id/go-live` transitions from rehearsal → public
3. **Verify mobile:** go-live screen has "Rehearse" button and transition UI
4. **If any of these are missing:** implement them

**Verification:**
- Schema has the field
- Controller has the endpoint
- Mobile screen has the UI

---

### [ ] Task 9: Subscriber-Only Lives — Verify Implementation

**Same pattern as Task 8.** Verify `isSubscribersOnly` field, paywall logic, mid-stream toggle.

---

### [ ] Task 10: Thumbnail A/B Testing — Verify Full Flow

**Problem:** `ThumbnailVariant` model exists but the full flow (random serving, impression tracking, auto-declare winner) needs verification.

**Files to read first:**
- `apps/api/prisma/schema.prisma` — ThumbnailVariant model
- Search for any controller/service that handles thumbnail variants

**What to implement:**

1. **Verify these endpoints exist with real logic:**
   - `POST /thumbnails/variants` — upload variants
   - `GET /thumbnails/serve/:contentType/:contentId` — random variant per viewer
   - `POST /thumbnails/impression` — track impression
   - `POST /thumbnails/click` — track click
   - Auto-declare winner after 1000 impressions

2. **If endpoints are missing or stub:** implement them

**Verification:**
- Upload 3 thumbnail variants for a post → stored correctly
- Request thumbnail for the post 10 times → get different variants
- After enough impressions → winner is declared

---

### [ ] Task 11: Continue Watching — Mobile Home Screen Row

**Problem:** Backend endpoint exists in gamification service but no "Continue Watching" row is rendered on the mobile home screen.

**Files to read first:**
- `apps/api/src/modules/gamification/gamification.service.ts` — find continue watching logic
- `apps/mobile/app/(tabs)/minbar.tsx` or home screen

**What to implement:**

1. **Frontend — "Continue Watching" horizontal scroll row:**
   - Fetch `GET /api/v1/series/continue-watching` (or equivalent)
   - If user has partially-watched videos/series: show a horizontal scroll row
   - Each card: thumbnail with progress bar overlay, title, "Episode X" label
   - Tap → opens video at saved timestamp
   - Position: top of Minbar tab or home feed

2. **If backend endpoint is missing or broken:** fix it

**Verification:**
- Watch 50% of a video → close → reopen Minbar tab → "Continue Watching" row appears
- Tap → resumes at saved position

**i18n keys (ALL 8 files):**
```
continueWatching.title: "Continue Watching"
continueWatching.resume: "Resume"
continueWatching.episode: "Episode {{num}}"
```

---

### [ ] Task 12: Episode End Screen — Auto-Play Next

**Problem:** Series episodes exist but the auto-play countdown at the end of an episode likely isn't wired.

**Files to read first:**
- `apps/mobile/app/(screens)/video/[id].tsx` — video player screen
- `apps/mobile/src/components/ui/VideoPlayer.tsx`

**What to implement:**

1. **On video end (if video is part of a series):**
   - Check if there's a next episode
   - If yes: show overlay "Next Episode in 5 seconds" with:
     - Next episode title + thumbnail
     - Countdown timer (5...4...3...2...1)
     - "Play Next" button (skip countdown)
     - "Cancel" button (stay on current)
   - When countdown reaches 0: navigate to next episode
   - If last episode: show "Series Complete!" with share button

**Verification:**
- Watch episode 1 to end → countdown overlay appears → auto-plays episode 2
- Press "Cancel" → stays on current episode
- Last episode → shows completion screen

**i18n keys (ALL 8 files):**
```
series.nextEpisodeIn: "Next episode in {{seconds}}s"
series.playNext: "Play Next"
series.cancel: "Cancel"
series.seriesComplete: "Series Complete!"
series.shareCompletion: "Share"
```

---

### [ ] Task 13: Promoted Posts — Verify Ad Delivery in Feed

**Problem:** Promotions service (201 lines) exists but it's unclear if promoted posts actually get injected into the feed with "Sponsored" label.

**Files to read first:**
- `apps/api/src/modules/promotions/promotions.service.ts`
- `apps/api/src/modules/feed/feed.service.ts` — does it query for promoted posts?
- `apps/mobile/src/components/saf/PostCard.tsx` — is there a "Sponsored" label?

**What to implement:**

1. **Backend — Feed injection:**
   - In feed service: when building feed, query for active promotions targeting this user's demographics
   - Insert max 1 promoted post per 20 organic posts
   - Mark the post with `isPromoted: true` in the response

2. **Backend — Budget tracking:**
   - On each impression of a promoted post: decrement budget (CPM model)
   - When budget reaches 0: mark promotion as `ended`

3. **Frontend — "Sponsored" label:**
   - In PostCard: if `post.isPromoted`, show "Sponsored" label in `colors.text.tertiary` below the username

**Verification:**
- Create a promotion for a post → post appears in other users' feeds with "Sponsored" label
- Budget depleted → promotion stops appearing

---

### [ ] Task 14: Verify Sticker Generator Actually Generates

**Problem:** Stickers service is 366 lines but need to verify the AI generation flow actually works (Claude SVG → image → save).

**Files to read first:**
- `apps/api/src/modules/stickers/stickers.service.ts` — read the generation method

**What to verify/fix:**
1. `generateSticker()` calls Claude API with a prompt → gets SVG → converts to PNG (or serves SVG directly)
2. Rate limiting: 10 per user per day
3. Islamic presets exist and are accessible without generation
4. If generation method is a stub → implement it properly

---

### [ ] Task 15: Verify Voice Transcription Actually Transcribes

**Problem:** Whisper integration exists in AI service but need to verify it's wired into message creation flow.

**Files to read first:**
- `apps/api/src/modules/messages/messages.service.ts` — look for transcription call on voice message creation
- `apps/api/src/modules/ai/ai.service.ts` — look for transcribe method

**What to verify/fix:**
1. When a voice message is created (`messageType === 'voice'`): a transcription job is enqueued
2. The job calls Whisper API with the audio URL
3. Result is stored in `message.transcription` field
4. If not wired → wire it (enqueue job in message creation, process in ai-tasks processor)

---

### [ ] Task 16: Verify Frequent Creator Badge in Feed

**Problem:** Endpoint exists but need to verify PostCard actually shows the badge.

**Files to read first:**
- `apps/mobile/src/components/saf/PostCard.tsx`
- API response for feed posts

**What to verify/fix:**
1. Feed response includes `isFrequentCreator: boolean` per post
2. PostCard checks this field and shows a small gold star/badge next to creator name
3. If not in PostCard → add it

---

### [ ] Task 17: Verify Flipside/Alt Profile Endpoints Work

**Problem:** Schema models exist but need to verify the full flow.

**Files to read first:**
- Search for alt-profile controller/service
- `apps/mobile/app/(screens)/edit-profile.tsx` — any flipside UI?

**What to verify/fix:**
1. `POST /users/me/alt-profile` — creates alt profile
2. `GET /users/:id/alt-profile` — returns alt profile (only if viewer has access)
3. Posts with `isAltProfile: true` are hidden from public feed
4. Mobile has UI to create/manage flipside
5. If any part is missing → implement it

---

## SECTION 3: COMPLETELY MISSING (Tasks 18-25)

---

### [ ] Task 18: Email Infrastructure (Resend)

**Problem:** Zero email code in the entire codebase. No welcome email, no digest, no transactional email.

**Pre-requisite:** `RESEND_API_KEY` env var must be set. If not available, implement with a fallback logger.

**What to implement:**

1. **Create email service:**
   - `apps/api/src/common/services/email.service.ts`
   - Use Resend SDK (`npm install resend` — may need Windows terminal)
   - Methods:
     - `sendWelcome(email, name)` — welcome email on sign up
     - `sendWeeklyDigest(email, data)` — weekly summary (top posts, new followers, prayer stats)
     - `sendSecurityAlert(email, data)` — "New login from [location]"
     - `sendCreatorWeeklySummary(email, data)` — creator analytics email
   - If Resend API key not set: log the email content instead of sending (graceful fallback)

2. **Wire into flows:**
   - User creation webhook (Clerk) → send welcome email
   - Device session new login → send security alert
   - Weekly cron (or manual trigger) → send digest to opted-in users

3. **Email templates:**
   - Simple HTML templates with Mizanly branding (emerald header, content, footer)
   - Not fancy — just functional text with basic styling

**Verification:**
- New user signs up → welcome email sent (or logged if no API key)
- New device login → security alert email sent
- Email service doesn't crash if Resend is not configured

**i18n keys (ALL 8 files):**
```
email.welcome: "Welcome to Mizanly"
email.weeklyDigest: "Your Weekly Summary"
email.securityAlert: "New Login Detected"
```

---

### [ ] Task 19: Notification Sounds

**Problem:** `assets/sounds/` directory doesn't exist. No custom notification sounds.

**What to implement:**

1. **Create sound files** (or use royalty-free sources):
   - `apps/mobile/assets/sounds/notification-default.wav` — subtle chime, <1 second
   - `apps/mobile/assets/sounds/message-received.wav` — soft ping, <0.5 second
   - `apps/mobile/assets/sounds/achievement.wav` — celebratory tone, <1 second
   - `apps/mobile/assets/sounds/prayer-reminder.wav` — gentle melodic note, <1 second
   - Since we can't generate audio, create silent placeholder files AND document what sounds are needed
   - Alternative: use `expo-av` to play system sounds as placeholder

2. **Wire into notification channels:**
   - In `pushNotifications.ts`: reference custom sound files per channel
   - Messages channel → `message-received.wav`
   - Islamic channel → `prayer-reminder.wav`
   - Default → `notification-default.wav`

3. **Document for future:** Create `apps/mobile/assets/sounds/README.md` listing what each sound should be so a sound designer can create them.

**Verification:**
- `assets/sounds/` directory exists with placeholder files
- Notification channel configuration references the sound files

---

### [ ] Task 20: App Icon — Real Asset Files

**Problem:** HTML mockups exist in `design-samples/` but no actual icon asset files for Expo/App Store.

**What to implement:**

1. **Create icon as SVG:**
   - Pick the best concept from design-samples (Concept A: Arabic Mim or Concept E: Octagonal Seal)
   - Create `apps/mobile/assets/icon.svg` — the chosen design as clean SVG
   - Create `apps/mobile/assets/icon.png` — 1024x1024 PNG exported from the SVG
   - Create `apps/mobile/assets/adaptive-icon.png` — foreground layer for Android adaptive icon (with padding)

2. **Configure in app.json / app.config:**
   - `"icon": "./assets/icon.png"`
   - `"android": { "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#0A7B4F" } }`
   - `"ios": { "icon": "./assets/icon.png" }`

3. **Splash screen:**
   - Create `apps/mobile/assets/splash.png` — splash image (logo on emerald background)
   - Configure: `"splash": { "image": "./assets/splash.png", "resizeMode": "contain", "backgroundColor": "#0A7B4F" }`

**Note:** Since we're generating via code, create the simplest clean version — emerald square with gold Mim (م) centered. This is better than the default Expo icon.

**Verification:**
- `assets/icon.png` exists and is a valid 1024x1024 image
- `app.json` references it correctly
- Expo build would use this icon (verify config, can't verify actual build)

---

### [ ] Task 21: Splash Screen — Real Asset

**If not covered by Task 20:** Create `assets/splash.png` as a real image file, not just HTML mockup. Configure in app.json.

---

### [ ] Task 22: App Store Screenshots — Real Device Captures

**Problem:** HTML mockups exist but App Store needs real screenshots from the running app.

**What to implement:**

Since the app can't run on a physical device yet (Apple Developer enrollment pending), create high-quality mock screenshots using the existing HTML mockups:

1. **Refine `design-samples/app-store-screenshots.html`:**
   - Adjust to exact iPhone 6.7" dimensions (1290x2796px)
   - Add actual mock data that looks realistic (not "lorem ipsum")
   - Add device frame overlay (optional)

2. **Create screenshot capture script:**
   - Document the process: "Open HTML in browser → resize to 1290x2796 → screenshot → save"
   - Or use Playwright to capture at exact dimensions

3. **Save to `apps/mobile/app-store-metadata/screenshots/`**

**Verification:**
- 6 screenshot images exist at correct dimensions
- Content looks realistic and professional

---

### [ ] Task 23: CLAUDE.md Metrics Update

**Problem:** CLAUDE.md still has pre-Batch 2 metrics. Need to update with current accurate numbers.

**What to implement:**

1. **Count current metrics:**
   - Total screens: `find apps/mobile/app -name "*.tsx" | wc -l`
   - Backend modules: `ls apps/api/src/modules | wc -l`
   - Prisma models: `grep -c "^model " apps/api/prisma/schema.prisma`
   - Schema lines: `wc -l apps/api/prisma/schema.prisma`
   - Test files: `find apps/api/src -name "*.spec.ts" | wc -l`
   - Total tests: from `npx jest` output
   - Total commits: `git log --oneline | wc -l`
   - i18n keys: count from en.json

2. **Update CLAUDE.md** with accurate numbers
3. **Update the Status section** to reflect Batch 3 completion

**Verification:**
- All numbers in CLAUDE.md match actual `wc -l` / `grep` counts
- No inflated or outdated metrics

---

### [ ] Task 24: Parity Scores Document Update

**Problem:** `docs/PARITY_SCORES_BATCH85.md` has outdated scores.

**What to implement:**

1. **Create `docs/PARITY_SCORES_BATCH3.md`** with honest post-Batch 3 scores per dimension
2. **Use the scoring methodology from our audit** — compare against real competitors, not against "does the file exist"
3. **Include what changed and what didn't change from the previous scores**

---

### [ ] Task 25: Final Test Suite Verification

**Problem:** Need to ensure all new models, services, and endpoints from Batch 2-3 have test coverage and all tests pass.

**What to implement:**

1. **Run full test suite:** `npx jest --no-coverage` → must be 0 failures
2. **Check for new services without tests:**
   - `halal.service.ts` — has test?
   - Any new Batch 2 services — have tests?
3. **Create basic tests for any untested new service** (at minimum: module instantiation + one method)
4. **Run and verify:** all pass

**Verification:**
- `npx jest --no-coverage` → 0 failures
- New services have at least basic test coverage

---

## SECTION 4: QUALITY POLISH (Tasks 26-30)

---

### [ ] Task 26: Verify All New Screens Follow CLAUDE.md Rules

**Audit these new screens added in Batch 2:**
- `halal-finder.tsx` — has BottomSheet (not Modal)? Skeleton loading? EmptyState? RefreshControl? i18n?
- `dua-collection.tsx` — same checks
- `fasting-tracker.tsx` — same checks
- `names-of-allah.tsx` — same checks
- `hifz-tracker.tsx` — same checks
- `morning-briefing.tsx` (Task 3) — same checks

**For each screen that violates any rule: fix it.**

---

### [ ] Task 27: Verify All New i18n Keys Exist in All 8 Languages

**Run the i18n audit script:**
```bash
node apps/mobile/scripts/audit-i18n.js
```

**Fix any issues found:**
- Missing keys in any language
- Broken interpolation variables
- Empty string values
- Keys identical to English in non-English files (likely untranslated)

---

### [ ] Task 28: Accessibility Labels on New Screens

**Add `accessibilityLabel` and `accessibilityRole` to all interactive elements on:**
- halal-finder.tsx
- dua-collection.tsx
- fasting-tracker.tsx
- names-of-allah.tsx
- hifz-tracker.tsx
- morning-briefing.tsx

---

### [ ] Task 29: Remove Dead Code and Unused Imports

**Quick cleanup pass:**
- Search for unused imports across new files
- Remove any `console.log` statements (except in `__DEV__` blocks)
- Remove any `// TODO` or `// FIXME` comments — either do the work or remove the comment

---

### [ ] Task 30: Final Comprehensive Commit + Status Update

**This is the last task. After everything above is done:**

1. Run full test suite → 0 failures
2. Run i18n audit → 0 issues
3. Verify no `as any` in non-test code
4. Update CLAUDE.md with final metrics
5. Update ralph-batch3.md progress log
6. Single commit: `"feat: Batch 3 complete — all gaps closed, all half-done items finished"`

---

## PROGRESS LOG

### Completed:
(none yet)

### Blocked:
(carry forward if any)

---

*Remember: Read `docs/ralph-instructions.md` for behavioral rules. NEVER stop. NEVER shortcut. VERIFY everything.*
