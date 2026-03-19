# Mizanly — Batch 85: Zero Gaps, Full Coverage, 10/10 Parity
# EVERY task must be done individually. NO batch-grep. NO shortcuts.

---

## SECTION A: FIX ALL DEFERRED ISSUES FROM AUDIT

### A1: Arabic Translation — Fill 294 Missing Keys
For EACH missing key: read en.json, find the key, write the Arabic translation in ar.json.
Do NOT use machine translation placeholders. Write real Arabic or transliterated Arabic.

- [ ] A1.01 Read apps/mobile/src/i18n/en.json fully. Read apps/mobile/src/i18n/ar.json fully. Diff to find ALL missing keys. List them.
- [ ] A1.02 Add first 50 missing Arabic translation keys to ar.json (keys starting with a-c)
- [ ] A1.03 Add next 50 missing Arabic translation keys to ar.json (keys starting with c-f)
- [ ] A1.04 Add next 50 missing Arabic translation keys to ar.json (keys starting with f-m)
- [ ] A1.05 Add next 50 missing Arabic translation keys to ar.json (keys starting with m-p)
- [ ] A1.06 Add next 50 missing Arabic translation keys to ar.json (keys starting with p-s)
- [ ] A1.07 Add remaining ~44 missing Arabic translation keys to ar.json (keys starting with s-z)
- [ ] A1.08 Remove all 122 orphan Arabic keys (keys in ar.json that do NOT exist in en.json)
- [ ] A1.09 Verify ar.json key count now matches en.json key count exactly. Print both counts.
- [ ] A1.10 Commit: "i18n: fill 294 missing Arabic keys + remove 122 orphans"

### A2: ScreenErrorBoundary — Fix 7 Missing Screens
Find the 7 screens (out of 196) that don't have ScreenErrorBoundary wrapping.

- [ ] A2.01 Run grep on ALL 196 screen files to find which ones do NOT import ScreenErrorBoundary. List all 7.
- [ ] A2.02 Fix screen 1 of 7: Read the file, wrap the default export with ScreenErrorBoundary
- [ ] A2.03 Fix screen 2 of 7
- [ ] A2.04 Fix screen 3 of 7
- [ ] A2.05 Fix screen 4 of 7
- [ ] A2.06 Fix screen 5 of 7
- [ ] A2.07 Fix screen 6 of 7
- [ ] A2.08 Fix screen 7 of 7
- [ ] A2.09 Verify: grep ALL 196 screens for ScreenErrorBoundary, confirm 196/196 now have it
- [ ] A2.10 Commit: "fix: add ScreenErrorBoundary to 7 remaining screens (196/196 now covered)"

### A3: Dead Code Cleanup — 8 Services with `take: 50` Patterns
Each service has a dead `take: 50` in a ternary else branch that gets overridden by `take: limit + 1`.

- [ ] A3.01 Read apps/api/src/modules/stories/stories.service.ts — find and remove dead take:50 pattern
- [ ] A3.02 Read apps/api/src/modules/stickers/stickers.service.ts — find and remove
- [ ] A3.03 Read apps/api/src/modules/posts/posts.service.ts — find and remove
- [ ] A3.04 Read apps/api/src/modules/collabs/collabs.service.ts — find and remove
- [ ] A3.05 Read apps/api/src/modules/messages/messages.service.ts — find and remove
- [ ] A3.06 Read apps/api/src/modules/live/live.service.ts — find and remove
- [ ] A3.07 Read apps/api/src/modules/reels/reels.service.ts — find and remove
- [ ] A3.08 Read apps/api/src/modules/story-chains/story-chains.service.ts — find and remove
- [ ] A3.09 Commit: "fix: remove 8 dead-code take:50 patterns across services"

### A4: Prisma onDelete Rules — 50 Relations
Read schema.prisma (3,295 lines). Find every relation missing onDelete. Add appropriate Cascade or SetNull.

- [ ] A4.01 Read apps/api/prisma/schema.prisma lines 1-500. Find and fix missing onDelete on relations.
- [ ] A4.02 Read schema.prisma lines 500-1000. Find and fix.
- [ ] A4.03 Read schema.prisma lines 1000-1500. Find and fix.
- [ ] A4.04 Read schema.prisma lines 1500-2000. Find and fix.
- [ ] A4.05 Read schema.prisma lines 2000-2500. Find and fix.
- [ ] A4.06 Read schema.prisma lines 2500-3000. Find and fix.
- [ ] A4.07 Read schema.prisma lines 3000-3295. Find and fix.
- [ ] A4.08 Verify: grep schema.prisma for relations WITHOUT onDelete. Target: 0 remaining.
- [ ] A4.09 Commit: "fix: add onDelete rules to ~50 Prisma relations"

---

## SECTION B: COMPLETE TEST COVERAGE

### B1: Write Tests for 10 Services Missing Test Files
Each test file must have MINIMUM 10 meaningful test cases covering: happy path, error path, edge cases, auth.

- [ ] B1.01 Write apps/api/src/modules/embeddings/embeddings.service.spec.ts — test: createEmbedding, getEmbedding, findSimilar, deleteEmbedding, embed with invalid content, embed already existing, vector dimension validation, batch embed, search with filters, empty results. MIN 10 tests.
- [ ] B1.02 Write apps/api/src/modules/embeddings/embedding-pipeline.service.spec.ts — test: processQueue, retryFailed, skipExisting, handleApiError, batchSize limits, progress tracking, cancel, resume, empty queue, concurrent limits. MIN 10 tests.
- [ ] B1.03 Write apps/api/src/modules/feed/feed-transparency.service.spec.ts — test: getReasons, formatReasons, handleUnknownPost, multipleReasons, emptyReasons, localization, caching, invalidPostId, userPreferences, algorithmVersion. MIN 10 tests.
- [ ] B1.04 Write apps/api/src/modules/feed/personalized-feed.service.spec.ts — test: generateFeed, coldStart, diversityInjection, islamicBoost, timeDecay, sessionSignals, blockedContent, paginationCursor, emptyFeed, newUserFeed. MIN 10 tests.
- [ ] B1.05 Write apps/api/src/modules/islamic/islamic-notifications.service.spec.ts — test: prayerTimeNotif, dndDuringPrayer, jummahReminder, ramadanDigest, eidGreeting, adhanTrigger, locationBasedTiming, disabledNotifs, timezoneHandling, batchDelivery. MIN 10 tests.
- [ ] B1.06 Write apps/api/src/modules/moderation/content-safety.service.spec.ts — test: detectNSFW, detectHateSpeech, islamicContextAware, forwardLimit, kindnessReminder, autoRemove, appeal, falsePositive, multiLanguage, rateLimiting. MIN 10 tests.
- [ ] B1.07 Write apps/api/src/modules/monetization/stripe-connect.service.spec.ts — test: createConnectedAccount, onboardCreator, processPayment, revenueSplit70_30, instantPayout, refund, webhookVerify, insufficientBalance, currencyConversion, taxReporting. MIN 10 tests.
- [ ] B1.08 Write apps/api/src/modules/notifications/push-trigger.service.spec.ts — test: triggerOnLike, triggerOnComment, triggerOnFollow, triggerOnMessage, batchTriggers, disabledNotifs, dndMode, rateLimiting, invalidToken, groupNotifs. MIN 10 tests.
- [ ] B1.09 Write apps/api/src/modules/notifications/push.service.spec.ts — test: sendToDevice, sendToMultiple, failedDelivery, retryLogic, badgeCount, soundCustom, silentPush, expoApiCall, tokenCleanup, payloadSize. MIN 10 tests.
- [ ] B1.10 Write apps/api/src/modules/retention/retention.service.spec.ts — test: viewMilestone, streakWarning, absenceNotif, morningDigest, weeklyAnalytics, gracePeriod, sessionTracking, caughtUpTrigger, reEngagement, disabledUser. MIN 10 tests.
- [ ] B1.11 Run ALL new tests. Fix any failures. Commit: "test: add 100+ tests for 10 previously untested services"

### B2: Beef Up Thin Test Files (< 5 test cases)
Each of these files needs to go from 2-4 tests to MINIMUM 10.

- [ ] B2.01 Read + expand audio-tracks.service.spec.ts from 2 → 10+ tests. Add: create, update, delete, search, filter by category, pagination, invalid ID, duplicate, permission check, empty.
- [ ] B2.02 Read + expand channel-posts.service.spec.ts from 2 → 10+ tests. Add: create, update, delete, list by channel, pagination, pin, unpin, membership check, non-member access, media post.
- [ ] B2.03 Read + expand drafts.controller.spec.ts from 3 → 10+ tests. Add: create, get, list, update, delete, auto-save, restore, expired draft, pagination, unauthorized.
- [ ] B2.04 Read + expand stickers.service.spec.ts from 3 → 10+ tests. Add: create pack, add sticker, remove, search, favorite, custom sticker, animated, pack order, duplicate, size limit.
- [ ] B2.05 Read + expand calls.service.spec.ts from 4 → 10+ tests. Add: initiate, accept, reject, end, group call, miss, history, duration, quality metrics, TURN config.
- [ ] B2.06 Read + expand feed.controller.spec.ts from 4 → 10+ tests. Add: getFeed, personalized, dismiss, undismiss, logInteraction, pagination, auth required, invalid cursor, empty feed, rate limit.
- [ ] B2.07 Read + expand health.controller.spec.ts from 4 → 10+ tests. Add: all healthy, DB down, Redis down, R2 down, Stream down, partial failure, response format, latency check, uptime, version.
- [ ] B2.08 Read + expand collabs.service.spec.ts from 5 → 10+ tests. Add: invite, accept, reject, cancel, list, remove collaborator, permissions, notification trigger, duplicate invite, expired.
- [ ] B2.09 Read + expand live.service.spec.ts from 5 → 10+ tests. Add: createStream, startStream, endStream, joinViewer, leaveViewer, sendGift, multiGuest, schedule, cancelSchedule, viewerCount.
- [ ] B2.10 Read + expand privacy.service.spec.ts from 5 → 10+ tests. Add: updateVisibility, blockList effect, muteList effect, lastSeenPrivacy, readReceiptPrivacy, storyPrivacy, profilePrivacy, searchVisibility, dataDownload, deleteAccount.
- [ ] B2.11 Read + expand chat-export.service.spec.ts from 6 → 10+ tests. Add: export text, export with media, large conversation, membership check, non-member denied, empty chat, date range, format options, size limit, cleanup.
- [ ] B2.12 Read + expand devices.service.spec.ts from 6 → 10+ tests. Add: register, unregister, list, pushToken, multiDevice, staleCleanup, platformDetect, lastActive, limit, duplicate.
- [ ] B2.13 Read + expand drafts.service.spec.ts from 6 → 10+ tests. Add: create, get, list, update, delete, autoSave, restore, expire, pagination, contentTypes.
- [ ] B2.14 Read + expand feed.service.spec.ts from 6 → 10+ tests. Add: logInteraction, dismiss, undismiss, getDismissed, getInterests, scoreWeighting, sessionSignals, dedup, cleanup, bulkDismiss.
- [ ] B2.15 Run ALL expanded tests. Fix failures. Commit: "test: expand 14 thin test files from avg 4 → 10+ cases each"

### B3: Integration Test — Critical User Flows
Write end-to-end test scenarios that test complete user flows across modules.

- [ ] B3.01 Write test: "New user signup → onboarding → first post → get notification" — tests auth, users, posts, notifications services together
- [ ] B3.02 Write test: "Creator posts reel → viewer watches → likes → creator gets notification" — tests reels, feed, notifications, gamification
- [ ] B3.03 Write test: "User sends DM → receiver sees it → reacts → typing indicator" — tests messages, conversations, socket events
- [ ] B3.04 Write test: "Creator enables tips → fan sends tip → creator sees revenue" — tests monetization, stripe-connect, payments
- [ ] B3.05 Write test: "Prayer time triggers → DND activates → digest sent after" — tests islamic-notifications, retention, push
- [ ] B3.06 Run all integration tests. Fix failures. Commit: "test: add 5 cross-module integration test flows"

---

## SECTION C: REACH 10/10 COMPETITOR PARITY

### C1: Bakra Live → 10/10 (currently 7/10 — needs multi-guest)
- [ ] C1.01 Read apps/api/src/modules/live/live.service.ts. Identify current guest support. Add: `inviteGuest(liveId, userId)`, `acceptGuestInvite(liveId, userId)`, `removeGuest(liveId, userId, hostId)`, `listGuests(liveId)`. Support up to 4 simultaneous guests.
- [ ] C1.02 Read apps/api/src/modules/live/live.controller.ts. Add endpoints: POST /live/:id/guests/invite, POST /live/:id/guests/accept, DELETE /live/:id/guests/:userId, GET /live/:id/guests
- [ ] C1.03 Add to schema.prisma: `LiveGuest` model (id, liveId, userId, status: INVITED|ACCEPTED|REMOVED, joinedAt, leftAt)
- [ ] C1.04 Read apps/mobile/app/(screens)/live/[id].tsx. Add multi-guest UI: guest video tiles (2x2 grid when 4 guests), invite button for host, accept/decline overlay for invitees
- [ ] C1.05 Read apps/mobile/app/(screens)/go-live.tsx. Add "Invite co-hosts" option before going live
- [ ] C1.06 Add socket events: `live_guest_invited`, `live_guest_joined`, `live_guest_left` to chat.gateway.ts
- [ ] C1.07 Write tests for live guest features (10 tests). Commit: "feat: multi-guest live streaming (up to 4 guests)"

### C2: Majlis Audio Rooms → 10/10 (currently 7/10 — needs recording, discovery)
- [ ] C2.01 Read apps/api/src/modules/audio-rooms/audio-rooms.service.ts. Add: `startRecording(roomId)`, `stopRecording(roomId)`, `getRecording(roomId)`, `listRecordings(userId)`. Store recording URL in AudioRoom model.
- [ ] C2.02 Add to schema.prisma: `recordingUrl String?`, `recordingDuration Int?`, `isRecording Boolean @default(false)` on AudioRoom model
- [ ] C2.03 Read apps/mobile/app/(screens)/audio-room.tsx. Add: record button for host (red dot indicator), "This room is being recorded" banner for participants, replay button after room ends
- [ ] C2.04 Add audio room discovery: in discover.tsx, add "Live Rooms" section showing active audio rooms sorted by participant count
- [ ] C2.05 Add "Upcoming Rooms" section — rooms scheduled for future with reminder button
- [ ] C2.06 Write tests (10 tests). Commit: "feat: audio room recording + discovery"

### C3: Risalah Calls → 10/10 (currently 7/10 — needs group video, screen sharing)
- [ ] C3.01 Read apps/api/src/modules/calls/calls.service.ts. Add: `createGroupCall(conversationId, initiatorId, participants: string[])` supporting up to 8 participants, `shareScreen(callId, userId)`, `stopScreenShare(callId, userId)`
- [ ] C3.02 Add to schema.prisma: `maxParticipants Int @default(2)`, `isScreenSharing Boolean @default(false)`, `screenShareUserId String?` on Call model
- [ ] C3.03 Read apps/mobile/app/(screens)/call/[id].tsx. Add: grid view for group calls (2x2 or 3x3 layout), screen share button, screen share viewer overlay, participant list with mute indicators
- [ ] C3.04 Add to conversation-info.tsx: "Start group call" button when group has 3+ members
- [ ] C3.05 Write tests (10 tests). Commit: "feat: group video calls (up to 8) + screen sharing"

### C4: Minbar Analytics → 10/10 (currently 7/10 — needs demographics)
- [ ] C4.01 Read apps/api/src/modules/videos/videos.service.ts and apps/api/src/modules/creator/creator.service.ts. Add demographic analytics: aggregate viewer country, age range, gender from User model data. Create `getAudienceDemographics(channelId)` method.
- [ ] C4.02 Add to schema.prisma: `ViewerDemographic` model (id, videoId, channelId, country, ageRange, gender, viewDate) — aggregated, not per-user
- [ ] C4.03 Read apps/mobile/app/(screens)/analytics.tsx. Add demographics section: country pie chart (top 5 countries), age range bar chart (13-17, 18-24, 25-34, 35-44, 45-54, 55+), gender split
- [ ] C4.04 Add traffic sources to analytics: search, browse, suggested, external, direct
- [ ] C4.05 Write tests (10 tests). Commit: "feat: audience demographics + traffic sources in analytics"

### C5: Minbar Video Chapters → 10/10
- [ ] C5.01 Read apps/api/src/modules/videos/videos.service.ts. Add: chapter parsing from description (timestamps like "0:00 Introduction\n2:30 Main Topic"), `getChapters(videoId)` endpoint
- [ ] C5.02 Add to schema.prisma: `VideoChapter` model (id, videoId, title, timestampSeconds, order)
- [ ] C5.03 Read apps/mobile/app/(screens)/video/[id].tsx. Add chapter UI: chapter markers on scrubber, chapter list in expandable section, tap chapter to seek
- [ ] C5.04 Read apps/mobile/src/components/ui/VideoControls.tsx. Add chapter marker dots on progress bar
- [ ] C5.05 Write tests (8 tests). Commit: "feat: video chapters with timeline markers"

### C6: Islamic Prayer → 10/10 (needs multiple adhan reciters, more calc methods)
- [ ] C6.01 Read apps/api/src/modules/islamic/islamic.service.ts. Add: `getAdhanReciters()` returning list of reciters (Mishary Alafasy, Abdul Basit, Maher Al-Muaiqly, etc.), `getCalculationMethods()` returning all methods (MWL, ISNA, Egypt, Makkah, Karachi, Tehran, JAKIM, DIYANET)
- [ ] C6.02 Read apps/mobile/app/(screens)/prayer-times.tsx. Add: reciter selector dropdown, calculation method selector, test adhan playback button
- [ ] C6.03 Add to user settings: `adhanReciter String @default("mishary")`, `calculationMethod String @default("MWL")` in schema.prisma User model or Settings model
- [ ] C6.04 Write tests (8 tests). Commit: "feat: multiple adhan reciters + 8 calculation methods"

### C7: Islamic Quran → 10/10 (needs audio recitation, word-by-word, tajweed)
- [ ] C7.01 Read apps/mobile/app/(screens)/quran-share.tsx and quran-reading-plan.tsx. Add: audio playback controls (play/pause/next ayah), reciter selector (Mishary, Sudais, Husary, Minshawi), word-by-word translation mode (tap word to see meaning)
- [ ] C7.02 Add to islamic.service.ts: `getQuranAudio(surah, ayah, reciter)` — return audio URL from Quran.com API or similar
- [ ] C7.03 Add tajweed color coding: rules for noon sakinah, meem sakinah, qalqalah, madd, ghunnah — color-coded text rendering in Quran display
- [ ] C7.04 Add to schema.prisma or config: `QuranReciter` enum or table with: id, name, arabicName, audioBaseUrl
- [ ] C7.05 Write tests (8 tests). Commit: "feat: Quran audio recitation, word-by-word, tajweed colors"

### C8: Islamic Zakat → 10/10 (needs asset types)
- [ ] C8.01 Read apps/mobile/app/(screens)/zakat-calculator.tsx. Add asset type inputs: gold (grams + karat), silver (grams), cash (multiple currencies), stocks (shares × price), crypto (BTC, ETH, etc.), business inventory, rental income, agricultural produce
- [ ] C8.02 Add nisab calculation: gold nisab (85g × current gold price), silver nisab (595g × current silver price), option for user to choose gold or silver nisab
- [ ] C8.03 Add to islamic.service.ts: `calculateZakat(assets: ZakatAsset[])` — returns breakdown by category + total, applying 2.5% rate with proper nisab threshold check
- [ ] C8.04 Add to islamicApi.ts: `getCurrentGoldPrice()`, `getCurrentSilverPrice()` — fetch from public API
- [ ] C8.05 Write tests (10 tests: each asset type + nisab threshold + multiple currencies). Commit: "feat: comprehensive Zakat calculator with gold/silver/stocks/crypto"

### C9: Discord Parity → 10/10 (needs always-on voice, role permissions)
- [ ] C9.01 Read apps/api/src/modules/communities/communities.service.ts. Add granular role permissions: `canSendMessages`, `canPostMedia`, `canInvite`, `canKick`, `canBan`, `canManageRoles`, `canManageChannels`, `canSpeak` in voice. Add `CommunityRole` model with these fields.
- [ ] C9.02 Read apps/api/src/modules/audio-rooms/audio-rooms.service.ts. Add: `createPersistentRoom(communityId, name)` — always-on voice channel that members can drop in/out of (not scheduled)
- [ ] C9.03 Add to schema.prisma: `CommunityRole` model (id, communityId, name, color, permissions JSON, position Int), `isPersistent Boolean @default(false)` on AudioRoom
- [ ] C9.04 Read apps/mobile/app/(screens)/communities.tsx. Add: voice channel indicators (green dot when members are in voice), role management section in community settings
- [ ] C9.05 Write tests (10 tests). Commit: "feat: granular role permissions + always-on voice channels in communities"

### C10: WeChat Parity → 10/10 (needs webhooks/extensibility)
- [ ] C10.01 Create apps/api/src/modules/webhooks/webhooks.module.ts, webhooks.controller.ts, webhooks.service.ts — allow communities/channels to register webhook URLs that receive event notifications (new post, new member, etc.)
- [ ] C10.02 Add to schema.prisma: `Webhook` model (id, communityId, url, secret, events: String[], isActive, createdAt, userId)
- [ ] C10.03 Add webhook events: `post.created`, `member.joined`, `member.left`, `message.sent`, `live.started`, `live.ended`
- [ ] C10.04 Add webhook delivery: sign payload with HMAC-SHA256 using secret, retry 3 times with exponential backoff on failure
- [ ] C10.05 Add to communities settings UI: "Webhooks" section where admins can add/remove/test webhook URLs
- [ ] C10.06 Write tests (10 tests). Commit: "feat: webhook system for community extensibility (WeChat-style)"

---

## SECTION D: i18n COMPLETENESS — ALL 8 LANGUAGES

### D1: Verify All 8 Languages Match en.json
- [ ] D1.01 Read tr.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.02 Read ur.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.03 Read bn.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.04 Read fr.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.05 Read id.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.06 Read ms.json, count keys, list missing vs en.json. Fill ALL missing.
- [ ] D1.07 Verify: ALL 8 language files have identical key count to en.json. Print counts.
- [ ] D1.08 Commit: "i18n: all 8 languages at 100% key parity with en.json"

---

## SECTION E: SENTRY ERROR REPORTING

### E1: Replace console.error with Structured Reporting
- [ ] E1.01 Add `@sentry/react-native` to mobile: create utils/sentry.ts with init config + captureException wrapper
- [ ] E1.02 Grep ALL mobile files for `console.error`. Replace each with Sentry.captureException or wrap in __DEV__ guard.
- [ ] E1.03 Add `@sentry/nestjs` to API: create common/sentry.config.ts with DSN from env
- [ ] E1.04 Grep ALL API files for `console.error` or `this.logger.error`. Ensure Sentry.captureException is called alongside.
- [ ] E1.05 Add Sentry error boundary wrapper to app/_layout.tsx root
- [ ] E1.06 Commit: "feat: Sentry error reporting across mobile + API"

---

## SECTION F: FINAL VERIFICATION

### F1: Run Full Test Suite
- [ ] F1.01 Run ALL backend tests: `cd apps/api && npm test`. ALL must pass. Fix any failures.
- [ ] F1.02 Count total test cases after all additions. Target: 1,500+ (up from 1,218).
- [ ] F1.03 Run TypeScript compile check: `cd apps/api && npx tsc --noEmit`. Zero errors.
- [ ] F1.04 Run mobile TypeScript check: `cd apps/mobile && npx tsc --noEmit`. Zero errors.

### F2: Final Parity Score Verification
- [ ] F2.01 Write updated competitor parity scores in docs/PARITY_SCORES_BATCH85.md:
  - Saf vs Instagram: target 10/10
  - Bakra vs TikTok: target 10/10
  - Majlis vs X/Twitter: target 10/10
  - Risalah vs WhatsApp: target 10/10
  - Minbar vs YouTube: target 10/10
  - vs Telegram: target 9/10 (mini apps deferred)
  - vs Discord: target 10/10
  - vs WeChat: target 8/10 (full super-app deferred)
  - Islamic vs Muslim Pro: target 10/10

### F3: Final Stats
- [ ] F3.01 Print final stats: total commits, total screens, total endpoints, total models, total test cases, total lines, total languages, test pass rate
- [ ] F3.02 Commit everything remaining. Push to origin/main.

---

## COMPLETION CRITERIA
ALL items above marked [x] = EXIT_SIGNAL: true
Any items remaining = EXIT_SIGNAL: false, continue working

## TASK COUNT SUMMARY
- Section A: 38 tasks (fixes from audit)
- Section B: 32 tasks (test coverage)
- Section C: 37 tasks (10/10 parity features)
- Section D: 8 tasks (i18n completeness)
- Section E: 6 tasks (Sentry)
- Section F: 7 tasks (verification)
- **GRAND TOTAL: 128 tasks**

## ESTIMATED NEW CODE
- ~100 new test cases (Section B1) = ~3,000 lines
- ~70 expanded test cases (Section B2) = ~2,000 lines
- ~5 integration tests (Section B3) = ~500 lines
- ~10 new features (Section C) = ~5,000 lines
- ~294 Arabic translations (Section A) = ~600 lines
- ~6 language file fills (Section D) = ~12,000 lines
- **Total estimated: ~23,000 new lines**
