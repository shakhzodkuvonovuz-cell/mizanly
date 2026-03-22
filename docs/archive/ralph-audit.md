# RALPH — Total Audit: Every File, Every Feature, Every Competitor
## This audit has 60 dimensions, 500+ checkpoints, and requires reading 700+ files.

> **You will spend the ENTIRE session auditing. Not fixing. Not building. AUDITING.**
> You will read files, compare against competitors, document every finding, and produce the most honest assessment of this codebase that has ever been written.

> **Read `CLAUDE.md` first** for architecture, rules, and component patterns.
> **Read `docs/ralph-instructions.md`** for behavioral rules.

---

## ABSOLUTE RULES

1. **NO SUBAGENTS.** Do all work personally. Read every file yourself.
2. **NO SURFACE-LEVEL SUMMARIES.** "Looks good" is not a finding. File name, line number, specific issue.
3. **NO BATCH SCANNING.** Don't grep for a pattern and declare "X instances found." Read the code around each match.
4. **NO SKIPPING.** Every dimension must be completed.
5. **READ BEFORE JUDGING.** Don't assess a file from its name. Read the implementation.
6. **COMPARE AGAINST REAL COMPETITORS.** Use web search for current 2026 features. Compare against Instagram/TikTok/YouTube/WhatsApp/X as they are TODAY, not as they were in 2024.
7. **BE BRUTALLY HONEST.** The user explicitly wants harsh truth. Sugarcoating disrespects them.
8. **FIX P0s IMMEDIATELY.** If you find a crash bug, fix it, commit, then continue auditing.
9. **DOCUMENT EVERYTHING** in `docs/audit/COMPREHENSIVE_AUDIT_2026.md`. Update after each dimension.
10. **CATEGORIZE EVERY FINDING:** P0 (crash/security), P1 (broken feature), P2 (quality), P3 (nitpick).

---

## OUTPUT FILES

Create these files as you go:
- `docs/audit/COMPREHENSIVE_AUDIT_2026.md` — master report, all findings
- `docs/audit/PRIORITY_FIXES.md` — P0 and P1 items in severity order
- `docs/audit/COMPETITOR_MATRIX.md` — feature-by-feature comparison tables
- `docs/audit/HONEST_SCORES.md` — per-dimension scores with evidence
- `docs/audit/SCREEN_BY_SCREEN.md` — audit results for every screen
- `docs/audit/ENDPOINT_BY_ENDPOINT.md` — audit results for every endpoint

---

# PART A: CODE INTEGRITY (Dimensions 1-20)

---

## DIMENSION 1: PRISMA SCHEMA — EVERY MODEL

Read `apps/api/prisma/schema.prisma` — ALL 3,859 lines. For EVERY one of the 187 models, check:

1. Has `id String @id @default(cuid())`?
2. Has `createdAt DateTime @default(now())`?
3. Every foreign key has `onDelete` rule? (Cascade, SetNull, or Restrict — not missing)
4. Every `@@index` matches actual query patterns in the corresponding service?
5. Every `@@unique` is correct and won't cause unexpected constraint violations?
6. `userId` naming (not `authorId`, `ownerId`, `creatorId`) — consistent?
7. Boolean fields use `isX` prefix consistently?
8. Money fields use `Decimal @db.Decimal(12,2)` not `Float`?
9. String fields storing fixed values (status, type, role) — should they be enums?
10. Every relation has both sides defined (no dangling `userId String` without `user User @relation(...)`)?
11. Default values: counters=0, booleans=false, timestamps=now()?
12. No circular dependencies that would break migrations?

**Produce a table of EVERY model with issues found.**

---

## DIMENSION 2: BACKEND SERVICES — EVERY MODULE

There are 79 modules. For EACH module that has a service file, read the FULL service file and document:

1. Total lines of code
2. Number of public methods
3. For each method:
   - Has input validation?
   - Has error handling (try/catch or proper NestJS exceptions)?
   - Has authorization check (user owns the resource)?
   - Uses `select` clause (not fetching full models)?
   - Has pagination for list methods?
   - Has `take` limit on findMany?
4. N+1 query patterns (loops making individual DB calls)?
5. Race conditions (concurrent requests causing data inconsistency)?
6. Stub methods (return empty array, `// TODO`, hardcoded data)?
7. Dead code (methods never called from any controller)?
8. Transaction usage for multi-table operations?

**The 79 modules to audit (read EVERY service file):**
```
admin, ai, alt-profile, audio-rooms, audio-tracks, auth, blocks, bookmarks,
broadcast, calls, channel-posts, channels, chat-export, checklists, circles,
clips, collabs, commerce, communities, community, community-notes, creator,
devices, discord-features, downloads, drafts, embeddings, encryption, events,
feed, follows, gamification, gifts, halal, hashtags, health, islamic, live,
majlis-lists, messages, moderation, monetization, mosques, mutes, notifications,
og, parental-controls, payments, playlists, polls, posts, privacy, profile-links,
promotions, recommendations, reel-templates, reels, reports, restricts, retention,
scheduling, scholar-qa, search, settings, stickers, stories, story-chains, stream,
subtitles, telegram-features, threads, thumbnails, two-factor, upload, users,
video-replies, videos, watch-history, webhooks
```

---

## DIMENSION 3: CONTROLLERS — EVERY ENDPOINT

There are 81 controllers. For EACH endpoint in EACH controller, verify:

1. Correct HTTP method (GET for reads, POST for creates, etc.)
2. Has `@UseGuards(ClerkAuthGuard)` or `@UseGuards(OptionalClerkAuthGuard)` — which, and is it correct?
3. Has `@Throttle()` rate limiting with appropriate limits?
4. Has `@ApiOperation()` Swagger documentation?
5. Has `@ApiBearerAuth()` if auth required?
6. Uses `@CurrentUser('id')` not `@CurrentUser()` without 'id'?
7. Every POST/PUT/PATCH has a DTO with class-validator decorators?
8. No GETs that modify data?
9. Response format consistent?

**Produce a table: Module | Endpoint | Method | Auth | Rate Limited | DTO | Issues**

---

## DIMENSION 4: MOBILE SCREENS — EVERY SINGLE ONE

There are 208 screen files. Read EVERY ONE and check:

**CLAUDE.md Rules (for each screen):**
1. Uses `<BottomSheet>` not RN `<Modal>`?
2. Uses `<Skeleton.*>` for loading not `<ActivityIndicator>` (except buttons)?
3. Uses `<EmptyState>` for empty lists not bare `<Text>`?
4. Uses `<Icon name="arrow-left">` for back not text/emoji?
5. Uses `<Icon name="x">` for close not text/emoji?
6. Uses `radius.*` from theme not hardcoded borderRadius?
7. Uses `expo-linear-gradient` not CSS gradient strings?
8. Has `<RefreshControl>` on every FlatList?
9. Wrapped with `<ScreenErrorBoundary>`?
10. Uses `useTranslation()` for ALL user-facing strings?

**Quality Checks (for each screen):**
11. Has loading state (Skeleton)?
12. Has empty state (EmptyState component)?
13. Has error state?
14. Has proper navigation (back button works)?
15. Uses design tokens (colors.*, spacing.*, fontSize.*, fonts.*)?
16. No hardcoded hex colors?
17. No hardcoded spacing numbers?
18. Has accessibility labels on interactive elements?
19. Has `accessibilityRole` on buttons?
20. RTL support (uses rtlFlexRow, rtlTextAlign where needed)?

**Here is EVERY screen file to audit. Do not skip any:**

**Auth (4 screens):**
- `(auth)/_layout.tsx`
- `(auth)/forgot-password.tsx`
- `(auth)/sign-in.tsx`
- `(auth)/sign-up.tsx`

**Onboarding (4 screens):**
- `onboarding/_layout.tsx`
- `onboarding/interests.tsx`
- `onboarding/profile.tsx`
- `onboarding/suggested.tsx`
- `onboarding/username.tsx`

**Tabs (7 screens):**
- `(tabs)/_layout.tsx`
- `(tabs)/saf.tsx`
- `(tabs)/majlis.tsx`
- `(tabs)/risalah.tsx`
- `(tabs)/bakra.tsx`
- `(tabs)/minbar.tsx`
- `(tabs)/create.tsx`

**Core Content Screens (15):**
- `post/[id].tsx`, `reel/[id].tsx`, `thread/[id].tsx`, `video/[id].tsx`
- `profile/[username].tsx`
- `conversation/[id].tsx`
- `story-viewer.tsx`
- `search.tsx`, `search-results.tsx`, `discover.tsx`
- `notifications.tsx`
- `settings.tsx`
- `edit-profile.tsx`
- `hashtag/[tag].tsx`, `hashtag-explore.tsx`

**Content Creation (14):**
- `create-post.tsx`, `create-reel.tsx`, `create-story.tsx`, `create-thread.tsx`, `create-video.tsx`
- `create-broadcast.tsx`, `create-clip.tsx`, `create-event.tsx`, `create-group.tsx`, `create-playlist.tsx`
- `video-editor.tsx`, `image-editor.tsx`, `caption-editor.tsx`, `green-screen-editor.tsx`

**Messaging & Communication (18):**
- `new-conversation.tsx`, `conversation-info.tsx`, `conversation-media.tsx`
- `call/[id].tsx`, `call-history.tsx`
- `live/[id].tsx`, `go-live.tsx`, `schedule-live.tsx`
- `audio-room.tsx`
- `pinned-messages.tsx`, `starred-messages.tsx`, `saved-messages.tsx`
- `chat-export.tsx`, `chat-folders.tsx`, `chat-lock.tsx`, `chat-theme-picker.tsx`, `chat-wallpaper.tsx`
- `dm-note-editor.tsx`

**Islamic Features (20):**
- `prayer-times.tsx`, `qibla-compass.tsx`, `islamic-calendar.tsx`
- `quran-room.tsx`, `quran-reading-plan.tsx`, `quran-share.tsx`, `tafsir-viewer.tsx`
- `hadith.tsx`
- `dhikr-counter.tsx`, `dhikr-challenges.tsx`, `dhikr-challenge-detail.tsx`
- `mosque-finder.tsx`, `halal-finder.tsx`
- `dua-collection.tsx`, `names-of-allah.tsx`, `hifz-tracker.tsx`, `fasting-tracker.tsx`
- `morning-briefing.tsx`, `ramadan-mode.tsx`, `eid-cards.tsx`
- `hajj-companion.tsx`, `hajj-step.tsx`
- `nasheed-mode.tsx`
- `zakat-calculator.tsx`, `waqf.tsx`, `donate.tsx`, `charity-campaign.tsx`
- `scholar-verification.tsx`, `fatwa-qa.tsx`

**Profile & Social (14):**
- `followers/[userId].tsx`, `following/[userId].tsx`, `mutual-followers.tsx`
- `follow-requests.tsx`, `blocked.tsx`, `muted.tsx`, `restricted.tsx`
- `circles.tsx`, `close-friends.tsx`
- `share-profile.tsx`, `qr-code.tsx`, `qr-scanner.tsx`
- `profile-customization.tsx`
- `contact-sync.tsx`

**Gamification (6):**
- `achievements.tsx`, `challenges.tsx`, `streaks.tsx`, `leaderboard.tsx`
- `xp-history.tsx`
- `wind-down.tsx`

**Commerce & Monetization (12):**
- `marketplace.tsx`, `product-detail.tsx`, `product/[id].tsx`, `orders.tsx`
- `creator-dashboard.tsx`, `creator-storefront.tsx`, `analytics.tsx`, `post-insights.tsx`
- `cashout.tsx`, `revenue.tsx`, `enable-tips.tsx`, `send-tip.tsx`
- `gift-shop.tsx`
- `boost-post.tsx`, `branded-content.tsx`
- `membership-tiers.tsx`

**Settings & Privacy (16):**
- `account-settings.tsx`, `account-switcher.tsx`
- `content-settings.tsx`, `content-filter-settings.tsx`, `media-settings.tsx`
- `disappearing-settings.tsx`, `disappearing-default.tsx`
- `notification-tones.tsx`
- `status-privacy.tsx`
- `parental-controls.tsx`, `link-child-account.tsx`
- `biometric-lock.tsx`
- `manage-data.tsx`, `storage-management.tsx`
- `screen-time.tsx`, `quiet-mode.tsx`
- `theme-settings.tsx`

**Media & Content Tools (12):**
- `camera.tsx`, `disposable-camera.tsx`, `photo-music.tsx`
- `audio-library.tsx`, `trending-audio.tsx`, `sound/[id].tsx`
- `sticker-browser.tsx`
- `reel-remix.tsx`, `reel-templates.tsx`, `duet-create.tsx`, `stitch-create.tsx`
- `end-screen-editor.tsx`
- `voice-post-create.tsx`, `voice-recorder.tsx`

**Community & Discovery (12):**
- `communities.tsx`, `community-posts.tsx`
- `local-boards.tsx`, `volunteer-board.tsx`, `mentorship.tsx`
- `event-detail.tsx`
- `channel/[handle].tsx`, `edit-channel.tsx`
- `broadcast-channels.tsx`, `manage-broadcast.tsx`
- `watch-party.tsx`, `watch-history.tsx`

**Misc (10):**
- `archive.tsx`, `saved.tsx`, `bookmark-collections.tsx`, `bookmark-folders.tsx`
- `downloads.tsx`, `drafts.tsx`
- `report.tsx`, `reports/[id].tsx`, `my-reports.tsx`, `appeal-moderation.tsx`
- `why-showing.tsx`, `cross-post.tsx`
- `ai-assistant.tsx`, `ai-avatar.tsx`
- `verify-encryption.tsx`
- `location-picker.tsx`
- `majlis-lists.tsx`, `majlis-list/[id].tsx`
- `playlists/[channelId].tsx`, `playlist/[id].tsx`, `save-to-playlist.tsx`
- `series-detail.tsx`, `series-discover.tsx`, `series/[id].tsx`
- `video-premiere.tsx`
- `share-receive.tsx`
- `followed-topics.tsx`
- `2fa-setup.tsx`, `2fa-verify.tsx`
- `collab-requests.tsx`

**Produce: `docs/audit/SCREEN_BY_SCREEN.md` with a row per screen documenting violations found.**

---

## DIMENSION 5: UI COMPONENTS — ALL 35

Read every file in `apps/mobile/src/components/ui/`:
```
ActionButton, AuthGate, Autocomplete, Avatar, Badge, BottomSheet, CaughtUpCard,
CharCountRing, DoubleTapHeart, EmptyState, EndScreenOverlay, FadeIn, FloatingHearts,
GlassHeader, GradientButton, Icon, ImageCarousel, ImageGallery, ImageLightbox,
LinkPreview, LocationPicker, MiniPlayer, OfflineBanner, PremiereCountdown, RichText,
ScreenErrorBoundary, Skeleton, TTSMiniPlayer, TabBarIndicator, TabSelector,
ToastNotification, VerifiedBadge, VideoControls, VideoPlayer, WebSafeBlurView
```

For each: Props typed? Memoized? Accessible? RTL? Theme tokens? Animations use Reanimated?

---

## DIMENSION 6: NON-UI COMPONENTS

Read every component NOT in `/ui/`:
- `apps/mobile/src/components/saf/` — PostCard, StoryBubble, StoryRow, etc.
- `apps/mobile/src/components/risalah/` — MessageBubble, StickerPackBrowser, etc.
- `apps/mobile/src/components/story/` — PollSticker, etc.
- `apps/mobile/src/components/islamic/` — EidFrame, etc.
- Any other component directories

For each: same checks as UI components.

---

## DIMENSION 7: HOOKS — ALL 23

Read every file in `apps/mobile/src/hooks/`:
```
useAmbientColor, useAnimatedPress, useBackgroundUpload, useChatLock,
useEntranceAnimation, useFpsMonitor, useHaptic, useIsWeb, useIslamicTheme,
useNetworkStatus, usePayment, usePiP, usePulseGlow, usePushNotificationHandler,
usePushNotifications, useReducedMotion, useResponsive, useScrollDirection,
useTTS, useTranslation, useVideoPreload, useVideoPreloader, useWebKeyboardShortcuts
```

For each:
1. Cleanup function in useEffect?
2. Correct dependency arrays?
3. Memory leak potential?
4. Error handling?
5. Is it actually used anywhere? (grep for import)

---

## DIMENSION 8: API SERVICES — ALL 19

Read every file in `apps/mobile/src/services/`:
```
api, audioRoomsApi, chatExportApi, communitiesApi, creatorApi, downloadManager,
encryption, encryptionApi, eventsApi, giftsApi, islamicApi, monetizationApi,
offlineCache, paymentsApi, promotionsApi, pushNotifications, reelTemplatesApi,
twoFactorApi, widgetData
```

For each:
1. Base URL configurable?
2. Auth token attached?
3. Error handling (network errors, 401, 429, 500)?
4. Response typing (no `any`)?
5. Pagination support?
6. Missing endpoints (backend has it but mobile doesn't call it)?
7. Stale endpoints (mobile calls it but backend doesn't have it)?

---

## DIMENSION 9: UTILITY FILES — ALL 14

Read every file in `apps/mobile/src/utils/`:
```
blurhash, deepLinking, feedCache, hijri, image, lazily, localeFormat,
navigation, offlineQueue, performance, platform, registerServiceWorker, rtl, sentry
```

For each: correct implementation? Used? Error handling? Edge cases?

---

## DIMENSION 10: ZUSTAND STORE

Read `apps/mobile/src/stores/index.ts` completely:
1. Shape flat vs nested?
2. All setters defined?
3. Type safety?
4. Persistence to AsyncStorage?
5. Stale fields (set but never read)?
6. Missing state (should be global but isn't)?

---

## DIMENSION 11: TYPE DEFINITIONS

Read `apps/mobile/src/types/index.ts` and any other type files:
1. Do types match Prisma models?
2. Any `any` types?
3. Are API response types accurate?
4. Missing types?

---

## DIMENSION 12: NAVIGATION & ROUTING

Read all layout files:
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(screens)/_layout.tsx`
- `app/(auth)/_layout.tsx`
- `app/onboarding/_layout.tsx`

Check:
1. Auth flow — anonymous browsing works?
2. Deep linking — all screens reachable by URL?
3. Tab bar — 5 tabs, correct icons, badges?
4. Back behavior — always works?
5. `as never` route casts — count them
6. Orphan screens — screens not reachable from any navigation path?

---

## DIMENSION 13: i18n — ALL 8 LANGUAGES

Read ALL 8 JSON files. Run audit script. Check:
1. Key parity (all 8 have identical keys)
2. Interpolation variables ({{var}} present in all translations)
3. Empty values
4. Untranslated values (identical to English)
5. Arabic RTL correctness
6. Islamic term consistency across languages
7. Pluralization handling
8. Date/time/number locale formatting

---

## DIMENSION 14: SOCKET.IO GATEWAY

Read `apps/api/src/gateways/chat.gateway.ts` and all DTOs. Check:
1. JWT auth on connection
2. Room management (join/leave, no leaks)
3. Every event: payload validated? Sender authorized? Response formatted?
4. Typing indicators with timeout
5. Presence tracking (Redis vs in-memory)
6. Delivery confirmation / read receipts
7. Reconnection handling
8. Quran rooms functionality
9. Call signaling — is there actual WebRTC?
10. Redis adapter for multi-instance scaling

---

## DIMENSION 15: SECURITY

1. **Auth guards** — read both guard files, verify JWT verification
2. **Authorization** — for every write endpoint, can User A modify User B's data?
3. **Input validation** — read 20 random DTOs, check validators
4. **SQL injection** — any raw SQL with string concatenation?
5. **XSS** — is user content sanitized?
6. **Encryption** — read encryption service fully, what does it actually encrypt?
7. **Data exposure** — do endpoints return sensitive fields (password hashes, emails of other users)?
8. **CORS** — read main.ts, what origins allowed?
9. **Rate limiting** — verify all 81 controllers
10. **Secrets in code** — any hardcoded API keys, tokens, passwords?
11. **Clerk webhook verification** — is the signature verified?
12. **File upload** — is the upload folder whitelisted? File type validation?

---

## DIMENSION 16: TESTING

Read at minimum 30 test files. Run the full suite. Check:
1. Total suites, tests, pass rate
2. Coverage quality (real logic or just "service is defined"?)
3. Mock quality (realistic or `as any` everywhere?)
4. Edge case testing (error paths, unauthorized, invalid input?)
5. Modules with NO test file — list every one
6. Integration tests — do they exist? Do they work?
7. Test isolation (no inter-test dependencies?)

---

## DIMENSION 17: DATA FILES — ISLAMIC CONTENT

Read every data file in `apps/api/src/modules/islamic/data/`:
1. `hadiths.json` — how many? Authentic sources? References?
2. `duas.json` — how many? Categories? Arabic + transliteration + translation + source?
3. `asma-ul-husna.json` — all 99? Arabic + meaning + explanation?
4. `hajj-guide.json` — comprehensive? Step-by-step?
5. `tafsir.json` (if exists) — source? Depth?
6. Any other data files

For each: is the data real and useful, or placeholder?

---

## DIMENSION 18: PERFORMANCE

1. **Database queries** — identify the 10 slowest-looking queries (no indexes, full scans, no select)
2. **Frontend lists** — FlatList with keyExtractor, getItemLayout, maxToRenderPerBatch?
3. **Memoization** — React.memo on list items?
4. **Image loading** — expo-image with caching?
5. **Bundle size** — unused dependencies? All 8 i18n files loaded at startup?
6. **Video preloading** — does Bakra actually preload next videos?
7. **Caching** — what's in Redis? What's in AsyncStorage? What should be cached but isn't?
8. **API response size** — endpoints returning full objects when minimal fields needed?

---

## DIMENSION 19: ACCESSIBILITY

1. Check 30 screens for `accessibilityLabel` on every interactive element
2. Color contrast — 5 most common text/bg combos against WCAG AA 4.5:1
3. Touch targets — all >= 44x44pt?
4. Font scaling — maxFontSizeMultiplier set?
5. Reduced motion — prefers-reduced-motion respected?
6. Screen reader flow — logical tab order?
7. No images without accessibilityLabel?

---

## DIMENSION 20: CODE QUALITY

1. `as any` in non-test code: count (must be 0)
2. `@ts-ignore` / `@ts-expect-error`: count (must be 0)
3. `as never`: count (route casts — known limitation)
4. `console.log` in production code: count (must be 0 or `__DEV__` gated)
5. `TODO` / `FIXME`: count and list every one
6. Dead imports in 30 random files
7. Inconsistent naming (camelCase vs snake_case)
8. Magic numbers (hardcoded timeouts, limits, thresholds)

---

# PART B: FEATURE DEPTH COMPARISON (Dimensions 21-40)

For EACH dimension below, compare against the REAL competitor app feature-by-feature. Use web search to verify current 2026 features.

---

## DIMENSION 21: FEED ALGORITHM (vs Instagram/TikTok)

Read `feed.service.ts`, `personalized-feed.service.ts`, `recommendations.service.ts` fully.
Compare:
1. Instagram: Two Towers neural networks, audition system, watch time #1 signal, DM sends strongest
2. TikTok: Interest graph, multi-stage ML ranking, computer vision for content understanding, 30-min cold start
3. Mizanly: What does the algorithm ACTUALLY do? Is it SQL weights or real ML?
4. Cold start: what does a zero-follow user see?
5. Diversity injection: are bubbles prevented?
6. Real-time adaptation: does the feed change mid-session?

---

## DIMENSION 22: STORIES (vs Instagram Stories)

Compare every aspect:
1. Creation: text, drawing, stickers (poll, question, quiz, countdown, emoji slider, music, location, mention), filters, AR effects
2. Viewing: progress bar, tap navigation, swipe between users, long-press pause, cube transition
3. Interactive responses: reply, quick reactions
4. Highlights: save to profile, cover image, naming
5. Close friends stories
6. Subscriber-only stories
7. Story analytics (views, interactions)

---

## DIMENSION 23: SHORT VIDEO (vs TikTok)

Compare:
1. Feed: full-screen vertical scroll, autoplay, sound on
2. Creation: record, trim, speed, transitions, effects, green screen, music, text, filters, templates
3. Duet/Stitch: side-by-side or sequenced
4. Sound system: trending sounds, sound page, use this sound
5. Effects/filters: AR, face tracking
6. Analytics: views, shares, completion rate
7. Shopping: product tags, shop from video
8. Live from Shorts: go live from short video creation

---

## DIMENSION 24: THREADING (vs X/Twitter)

Compare:
1. Post types: text, image, video, poll, quote, repost
2. Threading: reply chains, nested threads
3. Engagement: like, reply, repost, quote, bookmark, share
4. Feed: For You, Following, Trending tabs
5. Lists: create curated follow lists
6. Spaces (live audio): scheduled, spontaneous
7. Community Notes: crowd-sourced fact-checking
8. X Chat: standalone messaging
9. Grok AI integration

---

## DIMENSION 25: MESSAGING (vs WhatsApp)

Compare:
1. Text messages: formatting (bold, italic, strikethrough, monospace)
2. Voice messages: record, playback speed, transcription
3. Media: image, video, document, contact, location sharing
4. Group features: admin controls, member limits, description, invite links
5. Encryption: E2E, safety numbers, key verification
6. Disappearing messages: timer options
7. View once: photos and voice messages
8. Reactions: emoji reactions on messages
9. Status (Stories): text, photo, video status updates
10. Communities: multi-group organization
11. Channels: broadcast channels
12. Calls: voice, video, group (up to 32)
13. Payments: in-chat payments
14. Business features: catalogs, flows, auto-replies

---

## DIMENSION 26: LONG VIDEO (vs YouTube)

Compare:
1. Upload: long-form, title, description, tags, thumbnail, chapters
2. Player: quality selection, speed, PiP, fullscreen, ambient mode, theater mode
3. Playlists: create, add, reorder, collaborative
4. Comments: threaded, pinned, hearted by creator, sort by top/new
5. Subscriptions: subscribe, bell notification levels
6. Premiere: scheduled premiere with countdown
7. Creator tools: Studio, analytics, revenue, memberships, Super Chat
8. Shorts: integrated into long-form
9. Live: go live with chat, Super Chat, moderation
10. Community posts: text + image posts on channel

---

## DIMENSION 27: ISLAMIC FEATURES (vs Muslim Pro + Athan + Quran.com)

This is THE differentiator. Audit ruthlessly:
1. Prayer times: accuracy, calculation methods, location-based, notifications, adhan audio
2. Quran: full text? Audio? Multiple reciters? Tafsir? Bookmarks? Reading progress?
3. Hadith: collection size? Sources? Authentication status (sahih/hasan/da'if)?
4. Dua: how many? Categorized? Arabic + transliteration + translation + source?
5. 99 Names: all present? Explanations? Audio?
6. Fasting: tracker, iftar/suhoor times, streak, sunnah fasts
7. Zakat: calculator accuracy, multi-asset, nisab source
8. Mosque finder: data source, how many mosques, reviews
9. Halal finder: data source, how many restaurants, reviews
10. Qibla: compass accuracy, visual quality
11. Islamic calendar: Hijri conversion accuracy, event reminders
12. Hajj/Umrah: guide completeness
13. What Muslim Pro has that Mizanly doesn't
14. What Athan app has that Mizanly doesn't
15. What Quran.com has that Mizanly doesn't
16. What Mizanly has that NONE of them have

---

## DIMENSION 28: GAMIFICATION (vs Duolingo/Snapchat streaks)

Compare:
1. Streaks: daily login streaks, prayer streaks, reading streaks
2. XP system: what earns XP? How much? Is it balanced?
3. Levels: how many? What do they unlock?
4. Achievements/badges: how many? Meaningful or trivial?
5. Leaderboards: daily, weekly, all-time, friends, mosque community
6. Challenges: types, duration, rewards
7. Daily tasks: morning briefing completion rewards
8. Social proof: visible to others?

---

## DIMENSION 29: COMMERCE (vs TikTok Shop/Instagram Shopping)

Compare:
1. Product listings: images, description, price, variants
2. Checkout: payment flow, Stripe integration
3. Seller dashboard: orders, revenue, analytics
4. In-feed shopping: product tags on posts/reels
5. Virtual currency: coins, gifts, diamonds, cashout
6. Tipping: send/receive tips
7. Memberships: tiered subscriptions
8. Promoted posts: boost, targeting, budget, reporting
9. What TikTok Shop has that Mizanly doesn't
10. What Instagram Shopping has that Mizanly doesn't

---

## DIMENSION 30: CONTENT CREATION TOOLS (vs CapCut/Instagram Create)

Compare:
1. Photo editing: filters, adjustments, crop, text, stickers
2. Video editing: trim, split, speed, transitions, text overlay, music, export
3. Story creation: canvas, stickers (interactive), drawing, text, music
4. Reel creation: multi-clip, effects, green screen, templates
5. Audio: music library, sound sync, original audio
6. AI tools: auto-captions, content suggestions, hashtag suggestions, thumbnail generation
7. Collaboration: collab posts, duet, stitch
8. Scheduling: schedule posts for later

---

## DIMENSION 31: NOTIFICATIONS (vs Instagram/WhatsApp)

Compare:
1. Push notification types: what triggers a push?
2. In-app notification types: what appears in the notifications tab?
3. Notification grouping: "10 people liked your post" vs 10 individual notifications
4. Notification channels (Android): separate for messages, social, Islamic?
5. Quiet hours / DND: time-based suppression?
6. Per-category toggle: can user disable specific types?
7. Smart timing: does it respect prayer times?
8. Creator analytics notifications: "Your post got X views"?
9. Streak reminders?

---

## DIMENSION 32: SEARCH & DISCOVERY (vs TikTok Explore/Instagram Search)

Compare:
1. Search types: users, posts, hashtags, sounds, locations
2. Search engine: SQL LIKE vs Meilisearch?
3. Typo tolerance
4. Arabic-aware tokenization
5. Autocomplete / suggestions as you type
6. Recent searches
7. Trending searches
8. Explore/Discover feed: curated content for discovery
9. Hashtag pages: feed of posts with that hashtag
10. Sound pages: feed of videos using that sound

---

## DIMENSION 33: PROFILE (vs Instagram Profile)

Compare:
1. Profile header: avatar, cover, bio, website, follower/following counts
2. Post grid: 3-column grid, switch to list view
3. Story highlights: circular covers at top
4. Profile tabs: posts, reels, tagged, saved
5. Profile actions: follow/unfollow, message, block, report, mute
6. Edit profile: all fields editable
7. QR code: share profile via QR
8. Flipside / alt profile
9. Profile customization: themes, badges
10. Verified badge

---

## DIMENSION 34: PRIVACY & SAFETY (vs WhatsApp/Instagram)

Compare:
1. Private account: who can see your content?
2. Block: block users from seeing/contacting you
3. Mute: mute without unfollowing
4. Restrict: restrict comments without blocking
5. Content filtering: blocked keywords
6. Close friends: story sharing to select group
7. Disappearing messages: timer settings
8. View once: send-once media
9. Chat lock: lock conversations behind biometric/PIN
10. Two-factor auth: setup and recovery
11. Data export: GDPR compliance
12. Account deletion: grace period, data purge
13. Parental controls: child accounts, PIN protection
14. Screen time: usage tracking and limits

---

## DIMENSION 35: LIVE STREAMING (vs Instagram Live/YouTube Live/TikTok LIVE)

Compare:
1. Go live: camera setup, title, description
2. Rehearsal mode: test before going public
3. Multi-guest: how many guests?
4. Chat: real-time comments during live
5. Gifts/donations: send gifts during live
6. Subscribers-only: restrict to paid subscribers
7. Recording: save live to video
8. Schedule: schedule future live
9. Analytics: viewer count, peak viewers, engagement
10. Moderation: pin comments, block users, keyword filters
11. Screen sharing: share device screen

---

## DIMENSION 36: CALLS (vs WhatsApp/FaceTime)

Compare:
1. Voice call: 1-on-1
2. Video call: 1-on-1
3. Group voice call: how many participants?
4. Group video call: how many?
5. Screen sharing during call
6. Call history
7. WebRTC: is there ACTUAL peer-to-peer audio/video? Or just UI?
8. TURN server: configured for NAT traversal?
9. End-to-end encryption on calls?
10. Call quality: bitrate, codec?

---

## DIMENSION 37: ONBOARDING (vs TikTok/Instagram)

Compare:
1. Sign up flow: how many steps?
2. Account creation: email, phone, Apple, Google?
3. Interest selection: does it affect the feed?
4. Suggested follows: based on what?
5. Anonymous browsing: can you browse without account?
6. Contact sync: find friends from phone contacts?
7. Skip option: can you skip onboarding?
8. Cold start: what does day 1 feed look like?

---

## DIMENSION 38: RETENTION MECHANICS (vs TikTok/Snapchat)

Compare:
1. Infinite scroll: autoplay next content?
2. "One more" psychology: what keeps users scrolling?
3. Vanity metrics: "Your post got X views" notifications?
4. Streaks: penalty for breaking?
5. Daily tasks: morning briefing, dhikr challenge?
6. FOMO: stories expire after 24h?
7. Social proof: "X people from your community joined"?
8. Re-engagement: "You haven't posted in 3 days" notifications?
9. Completion satisfaction: "You're all caught up"?
10. Prayer-time-aware: notifications respect salah?

---

## DIMENSION 39: MODERATION (vs Instagram/TikTok/X)

Compare:
1. AI moderation: automatic content detection?
2. Human review queue: manual moderation?
3. Report system: what can users report?
4. Appeal process: can users contest decisions?
5. NSFW detection: image classification?
6. Hate speech detection: text analysis?
7. Islamic context awareness: Quran recitation ≠ music?
8. Community Notes: crowd-sourced fact-checking?
9. Forward limits: misinformation prevention?
10. Content warnings: sensitive content blur?
11. User-level moderation: blocked keywords per user?
12. Auto-action tiers: auto-remove vs flag for review?
13. Moderation transparency: public reports?

---

## DIMENSION 40: ACCESSIBILITY (vs Apple/Google guidelines)

Compare against Apple HIG accessibility guidelines AND Material Design accessibility:
1. VoiceOver/TalkBack full support?
2. Dynamic Type / font scaling?
3. Color contrast WCAG AA?
4. Reduced motion support?
5. High contrast mode?
6. Keyboard navigation (web)?
7. Focus indicators?
8. Screen reader logical flow?
9. Alt text on all images?
10. Audio descriptions for video?
11. Haptic feedback (meaningful, not decorative)?
12. Touch target sizes ≥ 44pt?

---

# PART C: INFRASTRUCTURE & READINESS (Dimensions 41-50)

---

## DIMENSION 41: THIRD-PARTY INTEGRATION STATUS

For EVERY service in `.env.example`:
- Clerk, Neon, R2, Stream, Images, Redis, Stripe, Claude, Whisper, Gemini, Meilisearch, Resend, Sentry, Expo Push, Firebase, TURN

For each: Installed? Integrated? Fallback? Tested? Status: working/partial/broken/missing.

---

## DIMENSION 42: DEPLOYMENT & INFRASTRUCTURE

1. Railway config — start command, health check, scaling?
2. Neon — connection pooling, read replicas?
3. Redis — session store, cache, job queue?
4. Multi-region? Single region?
5. CDN cache headers on media?
6. WebSocket clustering for Socket.io?
7. Background jobs (BullMQ) actually running?
8. Health endpoint returning correct status?
9. CI/CD pipeline — GitHub Actions?
10. Zero-downtime deployment possible?

---

## DIMENSION 43: DATABASE QUERIES AT SCALE

For the 10 most important services:
1. What happens with 100K users? 1M posts?
2. Are there full table scans?
3. Missing indexes on queried fields?
4. Unbounded `findMany` without `take`?
5. N+1 patterns?
6. Estimated query time at 100K rows?

---

## DIMENSION 44: ERROR HANDLING END-TO-END

1. API error filter — consistent format?
2. Network failure on mobile — crash or graceful?
3. Auth expiry — redirect or cryptic 401?
4. Offline mode — cache works?
5. Empty states — every possible empty screen handled?
6. Server 500 — user sees what?
7. Rate limited — user sees what?

---

## DIMENSION 45: MONETIZATION PIPELINE

1. Stripe customer creation — tested?
2. Stripe payment — tested?
3. Stripe Connect onboarding — tested?
4. Stripe webhook handling — tested?
5. Virtual currency buy flow — coins purchase works?
6. Gift sending — deducts coins, adds diamonds?
7. Cashout — diamonds to money?
8. Revenue split — 70/30 implemented?
9. Promoted post — budget tracking works?
10. Fraud detection — self-gifting prevention?

---

## DIMENSION 46: EMAIL SYSTEM

1. Email service exists?
2. Resend SDK installed?
3. Welcome email sent on sign up?
4. Security alert on new device?
5. Weekly digest for creators?
6. Templates branded?
7. Fallback if Resend unavailable?

---

## DIMENSION 47: PUSH NOTIFICATION PIPELINE

1. expo-notifications installed?
2. Token registration flow works?
3. Android channels configured?
4. iOS permissions flow?
5. Backend PushService sends via Expo Push API?
6. FCM configured (google-services.json)?
7. APNs configured (Apple Developer)?
8. Has any notification ever been delivered to a real device?
9. Prayer time notifications scheduled?
10. Smart timing (no push during salah)?

---

## DIMENSION 48: BRANDING & MARKETING

1. App icon — production-ready PNG?
2. Splash screen — configured?
3. Notification sounds — real or placeholder?
4. App Store description — complete?
5. App Store screenshots — real device captures?
6. Privacy policy URL?
7. Terms of service URL?
8. Landing page deployed?
9. Open Graph meta tags — sharing produces rich previews?
10. Social media accounts created?

---

## DIMENSION 49: LEGAL COMPLIANCE

1. GDPR — data export, right to deletion, consent management?
2. CCPA — California privacy requirements?
3. Apple App Store guidelines — likely rejection reasons?
4. Google Play policies — content policy compliance?
5. Age rating — content appropriate for stated rating?
6. Copyright — any unlicensed content (music, images)?
7. Privacy policy — exists, comprehensive, accessible?
8. Terms of service — exists, comprehensive?
9. Cookie consent — if web version exists?

---

## DIMENSION 50: DATA INTEGRITY

1. Prisma migrations — clean path from empty to current?
2. Seed data — Islamic data files complete?
3. Soft delete — isRemoved excluded from all queries?
4. Orphan data — what happens when a user is deleted?
5. Data consistency — counters (likesCount) match actual records?

---

# PART D: COMPETITOR DEEP RESEARCH (Dimensions 51-60)

Use web search extensively. Get current 2026 data.

---

## DIMENSION 51: UPSCROLLED — MARCH 2026 UPDATE

Search for latest UpScrolled news. Document:
1. Current user count
2. New features since February
3. Moderation improvements?
4. Islamic features added?
5. App Store rating now
6. Team growth?
7. Funding status?
8. Technical improvements?

---

## DIMENSION 52: MUSLIM PRO — MARCH 2026 UPDATE

Search for latest Muslim Pro features:
1. Social features — have they improved?
2. Download count now
3. New Islamic features
4. Monetization changes
5. Community features
6. Potential acquisition threat?

---

## DIMENSION 53: INSTAGRAM — MARCH 2026 FEATURES

Search for latest Instagram updates:
1. Flipside update
2. Short dramas
3. AI features
4. Creator tools
5. Edits app evolution
6. Algorithm transparency tool

---

## DIMENSION 54: TIKTOK — MARCH 2026 FEATURES

Search for latest TikTok updates:
1. US ownership final status
2. Local feed rollout
3. Shop features
4. Creator rewards changes
5. New content formats
6. Moderation changes

---

## DIMENSION 55: YOUTUBE — MARCH 2026 FEATURES

Search for latest YouTube updates:
1. Shorts monetization
2. AI tools (Veo, Make Me Move)
3. AskStudio updates
4. Thumbnail testing
5. Live streaming features
6. Creator tools

---

## DIMENSION 56: WHATSAPP — MARCH 2026 FEATURES

Search for latest WhatsApp updates:
1. Username system launch status
2. AI image features
3. Custom sticker generator
4. Voice transcription improvements
5. Business features
6. Community updates

---

## DIMENSION 57: X/TWITTER — MARCH 2026 FEATURES

Search for latest X updates:
1. X Chat (standalone DM app)
2. Video tab evolution
3. Grok AI integration depth
4. Community Notes expansion
5. Creator monetization changes

---

## DIMENSION 58: TELEGRAM — MARCH 2026 FEATURES

Search for latest:
1. AI summaries rollout
2. Liquid Glass on iOS 26
3. Gift crafting/auctions
4. Passkeys adoption
5. New features

---

## DIMENSION 59: EMERGING MUSLIM APPS

Search for:
1. Alfafaa growth?
2. Muslamica updates?
3. Deenify updates?
4. Any NEW Muslim social apps launched in 2026?
5. Muslim Pro competitors?
6. Islamic fintech apps?

---

## DIMENSION 60: MARKET TRENDS & OPPORTUNITIES

Research:
1. Islamic app market size 2026
2. Muslim digital economy trends
3. AI in social media trends
4. Decentralized social (Bluesky, Mastodon, AT Protocol)
5. Privacy legislation affecting social apps
6. Creator economy evolution
7. Short-form video market
8. Ramadan 2026/2027 — timing for launch?
9. Islamic events calendar 2026-2027 — opportunities?
10. Muslim population demographics — where are the biggest markets?

---

# FINAL DELIVERABLES

After completing ALL 60 dimensions:

1. **`docs/audit/COMPREHENSIVE_AUDIT_2026.md`** — master report
2. **`docs/audit/SCREEN_BY_SCREEN.md`** — every screen audited
3. **`docs/audit/ENDPOINT_BY_ENDPOINT.md`** — every endpoint audited
4. **`docs/audit/PRIORITY_FIXES.md`** — P0 and P1 items
5. **`docs/audit/COMPETITOR_MATRIX.md`** — feature comparison tables
6. **`docs/audit/HONEST_SCORES.md`** — scores with evidence
7. **`docs/audit/MARKET_ANALYSIS.md`** — competitor research + opportunities

---

# SESSION MANAGEMENT

This audit is too large for one session. Expected: 3-5 sessions.

**At end of each session:**
1. Commit all findings so far
2. Note exactly which dimension you stopped at
3. Note any P0 issues found but not yet fixed
4. The user will start a new session with: "Continue audit from Dimension X"

**Session 1:** Dimensions 1-10 (Schema, Backend, Controllers, Screens batch 1)
**Session 2:** Dimensions 11-25 (Mobile internals, Navigation, Security, Feature comparisons batch 1)
**Session 3:** Dimensions 26-40 (Feature comparisons batch 2, Accessibility, Moderation)
**Session 4:** Dimensions 41-50 (Infrastructure, Monetization, Legal)
**Session 5:** Dimensions 51-60 (Competitor research, Market analysis)

---

## REMEMBER

- **You are not here to praise the app.**
- **"Looks good" is not a finding.**
- **Every finding needs: file, line, issue, severity.**
- **Compare against Instagram/TikTok, not against "does the file exist."**
- **The user handles harsh criticism well and wants it.**
- **If it would embarrass you in a code review, flag it.**

**BEGIN WITH DIMENSION 1.**
