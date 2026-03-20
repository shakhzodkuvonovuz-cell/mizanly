# RALPH — Comprehensive Full-Stack Audit
## Every file. Every screen. Every endpoint. Every dimension. No shortcuts.

> **This is not a "check a few key areas" audit.** This is a line-by-line, file-by-file, screen-by-screen audit of the entire Mizanly codebase. You will read hundreds of files. You will check every endpoint. You will verify every screen. You will compare against real competitors. You will spend the entire session doing nothing but auditing and documenting findings.

> **Read `CLAUDE.md` first** for architecture, rules, and component patterns.
> **Read `docs/ralph-instructions.md`** for behavioral rules (no shortcuts, no subagents, verify everything).

---

## ABSOLUTE RULES FOR THIS AUDIT

1. **NO SUBAGENTS.** Do all work personally. Read every file yourself. Do not dispatch agents.
2. **NO SURFACE-LEVEL SUMMARIES.** Don't say "the feed looks good." Say exactly what you found — which files, which lines, what's wrong, what's right.
3. **NO BATCH SCANNING.** Don't grep for a pattern and declare "X instances found, looks fine." Read the actual code around each instance.
4. **NO SKIPPING.** Every section below must be completed. If you run out of context, commit your findings so far and note where to resume.
5. **READ BEFORE JUDGING.** Don't assess a file from its name or import list. Read the implementation.
6. **COMPARE AGAINST REAL COMPETITORS.** When auditing a feature, compare against how Instagram/TikTok/YouTube/WhatsApp/X actually implements it, not against "does the code exist."
7. **BE BRUTALLY HONEST.** Previous agents rated this app 10/10 when it was 5/10. You will not do that. If something is a stub, say it's a stub. If something won't work in production, say so.
8. **DOCUMENT EVERYTHING.** Write all findings to `docs/audit/COMPREHENSIVE_AUDIT_2026.md` as you go. Update it after each section.
9. **CATEGORIZE FINDINGS.** Every finding must be categorized as:
   - **P0 CRITICAL** — App will crash, data will be lost, or security is compromised
   - **P1 HIGH** — Feature doesn't work as expected, user will notice
   - **P2 MEDIUM** — Quality issue, inconsistency, or missing polish
   - **P3 LOW** — Nitpick, style issue, or minor improvement
10. **FIX AS YOU GO.** If you find a P0 or P1 during audit, fix it immediately. Commit the fix. Then continue auditing.

---

## OUTPUT FORMAT

Create `docs/audit/COMPREHENSIVE_AUDIT_2026.md` with this structure:

```markdown
# Comprehensive Audit — Mizanly
## Date: [today]
## Auditor: Claude
## Scope: Every dimension, every file, every screen

### Executive Summary
[Overall honest assessment — 2-3 paragraphs]

### Findings by Dimension
[Each dimension below gets its own section with numbered findings]

### Score Card
[Honest per-dimension scores with evidence]

### Priority Fix List
[All P0 and P1 items in order of severity]

### Competitor Gap Analysis
[Detailed comparison per space]
```

---

## AUDIT DIMENSIONS — Complete all 25

You must complete every single dimension below. Each dimension has specific instructions on what to check, how many files to read, and what to compare against.

---

### DIMENSION 1: PRISMA SCHEMA INTEGRITY

**What to check:**
Read `apps/api/prisma/schema.prisma` — the ENTIRE file (3,859 lines). Not just a sample. The whole thing.

**Specific checks:**
1. **Every model** — does it have an `id` field? Is it `@id @default(cuid())`?
2. **Every relation** — does it have an `onDelete` rule? Models without `onDelete` on foreign key relations will cause orphan data or cascade failures.
3. **Every `@@index`** — are the indexes on fields that are actually queried? Check the corresponding service file and verify the indexed fields match query patterns.
4. **Every `@@unique`** — are the unique constraints correct? Could they cause unexpected constraint violations?
5. **Field naming consistency:**
   - Is it always `userId` (not `authorId`, `ownerId`, `creatorId`)?
   - Is it always `createdAt` and `updatedAt`?
   - Are boolean fields named `isX` consistently (e.g., `isRemoved`, `isActive`, `isFeatured`)?
6. **Money fields** — verify ALL money fields use `Decimal @db.Decimal(12,2)`, not `Float`. Check every single one.
7. **String fields that should be enums** — are there string fields storing fixed values (like `status`, `type`, `role`) that should be Prisma enums for type safety?
8. **Missing relations** — are there fields like `userId String` without a corresponding `user User @relation(...)` line?
9. **Circular dependencies** — any models that reference each other in a way that could cause migration issues?
10. **Default values** — do counters default to 0? Do booleans default to false? Do timestamps default to `now()`?

**For each issue found, record:**
- Model name
- Field name
- What's wrong
- Severity (P0-P3)
- Suggested fix

---

### DIMENSION 2: BACKEND SERVICE LOGIC DEPTH

**What to check:**
Read EVERY service file in `apps/api/src/modules/`. There are 79 modules. For each module that has a service file:

1. **Read the full service file** — not just the first 50 lines. The ENTIRE file.
2. **Check each public method:**
   - Does it have proper input validation (or rely on DTO validation)?
   - Does it have error handling (try/catch, or throwing proper NestJS exceptions)?
   - Does it have authorization checks (verify the requesting user owns/can access the resource)?
   - Does it use `select` clauses to avoid fetching unnecessary data?
   - Does it have pagination (cursor-based) for list endpoints?
   - Does it have `take` limits on `findMany` calls to prevent unbounded queries?
3. **Check for N+1 queries** — loops that make individual database calls instead of batch queries with `include` or `in`.
4. **Check for race conditions** — concurrent requests that could cause data inconsistency (e.g., two users liking the same post simultaneously → count goes wrong).
5. **Check for stubs** — methods that return empty arrays, hardcoded data, or `// TODO` comments.
6. **Check for dead code** — methods that are never called from any controller.
7. **Check for proper transaction usage** — operations that modify multiple tables should use `$transaction`.

**Priority services to audit deeply (read every line):**
- `feed.service.ts` and `personalized-feed.service.ts` — the core algorithm
- `messages.service.ts` — the messaging engine
- `posts.service.ts` — content creation
- `users.service.ts` — user management
- `islamic.service.ts` — Islamic features
- `reels.service.ts` — video reels
- `threads.service.ts` — Majlis threads
- `stories.service.ts` — Stories
- `payments.service.ts` — money handling
- `encryption.service.ts` — security
- `notifications/push.service.ts` — push delivery
- `gamification.service.ts` — XP/streaks
- `moderation.service.ts` or equivalent — content safety
- `search.service.ts` — search
- `live/live.service.ts` — live streaming
- `calls/calls.service.ts` — voice/video calls

For each of these, produce a mini-report:
- Lines of code
- Number of public methods
- Methods that are stubs or incomplete
- Methods that have no error handling
- N+1 query patterns found
- Missing authorization checks
- Overall depth assessment (shallow/adequate/deep)

---

### DIMENSION 3: CONTROLLER & ENDPOINT AUDIT

**What to check:**
Read EVERY controller file in `apps/api/src/modules/`. There are 81 controllers.

For each controller:
1. **Every endpoint must have:**
   - `@UseGuards(ClerkAuthGuard)` or `@UseGuards(OptionalClerkAuthGuard)` — which is it and is it correct?
   - `@ApiOperation({ summary: '...' })` — is the Swagger doc meaningful?
   - `@ApiBearerAuth()` if auth is required
   - `@Throttle()` rate limiting — is it present? Is the limit appropriate?
   - `@CurrentUser('id')` for authenticated endpoints (NOT `@CurrentUser()` without `'id'`)
2. **HTTP method correctness:**
   - GET for reads (never modifies data)
   - POST for creates
   - PUT/PATCH for updates
   - DELETE for deletes
   - Are there any GETs that modify data? (P0)
3. **DTO validation:**
   - Does every POST/PUT/PATCH have a DTO with class-validator decorators?
   - Are DTOs using proper validators (`@IsString()`, `@IsOptional()`, `@Length()`, etc.)?
   - Are there endpoints that accept raw body without DTO validation? (P1)
4. **Response format:**
   - Does the TransformInterceptor apply to all responses?
   - Are responses consistent (`{ data, success, timestamp }`)?

**Produce a table:**
| Module | Endpoints | Auth Guard | Rate Limited | DTO Validated | Issues |
|--------|-----------|-----------|-------------|--------------|--------|

---

### DIMENSION 4: MOBILE SCREEN CONSISTENCY AUDIT

**What to check:**
Read at minimum 50 screen files from `apps/mobile/app/(screens)/`. Prioritize the most important ones, but also sample from less common ones.

For EACH screen, verify:

1. **CLAUDE.md rules compliance:**
   - Uses `<BottomSheet>` not RN `<Modal>` — search for `Modal` import
   - Uses `<Skeleton.*>` for loading states not `<ActivityIndicator>` (exception: buttons)
   - Uses `<EmptyState>` for empty lists not bare `<Text>`
   - Uses `<Icon name="arrow-left">` for back, not text/emoji
   - Uses `<Icon name="x">` for close, not text/emoji
   - Uses `radius.*` from theme, not hardcoded `borderRadius`
   - Uses `expo-linear-gradient`, not CSS gradient strings
   - Has `<RefreshControl>` on every FlatList/ScrollView
   - Uses `<ScreenErrorBoundary>` wrapper
   - Uses `useTranslation()` for all user-facing strings (no hardcoded English)

2. **Design token usage:**
   - Colors from `colors.*` theme, not hardcoded hex values
   - Spacing from `spacing.*` theme, not hardcoded numbers
   - Font sizes from `fontSize.*` theme, not hardcoded
   - Font families from `fonts.*`, not string literals
   - Border radius from `radius.*`, not numbers >= 6

3. **Accessibility:**
   - `accessibilityLabel` on every `Pressable`/`TouchableOpacity`
   - `accessibilityRole` on interactive elements
   - No images without `accessibilityLabel`

4. **Navigation:**
   - Does the back button work? (uses `router.back()` or `router.push()`)
   - Are route params properly typed?
   - Can the screen receive deep links?

5. **i18n:**
   - ZERO hardcoded English strings in the JSX
   - All user-facing text uses `t('key.path')`
   - Error messages are i18n'd
   - Button labels are i18n'd

6. **Error handling:**
   - What happens if the API call fails? Does it show a meaningful error?
   - What happens if the screen loads with no data?
   - Is there a retry mechanism?

**Screens to audit (MUST read all of these — not a sample, ALL of them):**
```
saf.tsx (tab)
bakra.tsx (tab)
majlis.tsx (tab)
risalah.tsx (tab)
minbar.tsx (tab)
create-post.tsx
create-reel.tsx
create-story.tsx
create-thread.tsx
create-video.tsx
post/[id].tsx
reel/[id].tsx
thread/[id].tsx
video/[id].tsx
profile/[id].tsx
conversation/[id].tsx
story-viewer.tsx
search.tsx
search-results.tsx
discover.tsx
notifications.tsx
settings.tsx
edit-profile.tsx
prayer-times.tsx
qibla-compass.tsx
quran-room.tsx
dhikr-counter.tsx
mosque-finder.tsx
halal-finder.tsx
dua-collection.tsx
fasting-tracker.tsx
names-of-allah.tsx
hifz-tracker.tsx
morning-briefing.tsx
go-live.tsx
audio-room.tsx
analytics.tsx
creator-dashboard.tsx
marketplace.tsx
zakat-calculator.tsx
challenges.tsx
streaks.tsx
achievements.tsx
leaderboard.tsx
account-settings.tsx
privacy.tsx (if exists)
blocked.tsx
muted.tsx
```

That's 48 screens minimum. Read each one fully. Document violations.

---

### DIMENSION 5: UI COMPONENT LIBRARY AUDIT

**What to check:**
Read EVERY component in `apps/mobile/src/components/ui/` (35 components).

For each component:
1. **Props interface** — is it properly typed with TypeScript? No `any` types?
2. **Default props** — are defaults sensible?
3. **Memoization** — is `React.memo` used where appropriate (list items, heavy renders)?
4. **Accessibility** — does it pass through `accessibilityLabel`?
5. **RTL support** — does it use `rtlFlexRow`, `rtlTextAlign`, `rtlMargin` where needed?
6. **Theme compliance** — uses design tokens, not hardcoded values?
7. **Animation quality** — uses Reanimated spring animations, not `Animated` API?
8. **Haptic feedback** — does it call `useHaptic()` on interactions?

**Key components to read every line:**
- `BottomSheet.tsx` — the modal replacement
- `Skeleton.tsx` — loading states
- `Icon.tsx` — icon system
- `Avatar.tsx` — user avatars
- `EmptyState.tsx` — empty list states
- `GradientButton.tsx` — primary CTA
- `VideoPlayer.tsx` — video playback
- `DoubleTapHeart.tsx` — like animation
- `AuthGate.tsx` — anonymous auth gate
- `OfflineBanner.tsx` — network status
- `TTSMiniPlayer.tsx` — read-aloud player
- `Toast.tsx` — notifications
- `CharCountRing.tsx` — character limit indicator

---

### DIMENSION 6: HOOKS AUDIT

**What to check:**
Read EVERY hook in `apps/mobile/src/hooks/` (23 hooks).

For each hook:
1. **Does it clean up?** — `useEffect` cleanup functions for subscriptions, timers, listeners
2. **Dependency arrays** — are they correct? Missing deps = stale closures. Extra deps = unnecessary rerenders.
3. **Memory leaks** — does it unsubscribe from events on unmount?
4. **Error handling** — does it handle failures gracefully?
5. **Naming** — follows `useX` convention?

**Key hooks to read every line:**
- `useHaptic.ts`
- `useTranslation.ts`
- `useNetworkStatus.ts`
- `useVideoPreloader.ts`
- `useAmbientColor.ts`
- `useIslamicTheme.ts`
- `useTTS.ts`
- `useAnimatedPress.ts`
- `usePushNotifications.ts`
- `usePushNotificationHandler.ts`
- `useScrollDirection.ts` (if exists)

---

### DIMENSION 7: API SERVICE LAYER (MOBILE)

**What to check:**
Read EVERY file in `apps/mobile/src/services/` (19 files).

For each service file:
1. **API base URL** — is it configurable (env var) or hardcoded?
2. **Auth token** — is the Clerk JWT attached to every authenticated request?
3. **Error handling** — do API calls handle network errors, 401s (token expired), 429s (rate limited), 500s?
4. **Response typing** — are responses properly typed? Or using `any`?
5. **Pagination** — do list APIs support cursor-based pagination?
6. **Consistency** — do all services follow the same pattern (fetch → parse → return typed data)?
7. **Missing endpoints** — are there backend endpoints with no corresponding mobile service call?
8. **Stale endpoints** — are there mobile service calls to endpoints that don't exist in the backend?

---

### DIMENSION 8: STATE MANAGEMENT (ZUSTAND STORE)

**What to check:**
Read `apps/mobile/src/stores/index.ts` completely.

1. **Store shape** — is it flat or deeply nested? (Flat is better for performance)
2. **Actions** — are all setters properly defined? Any direct mutations?
3. **Selectors** — are components selecting minimal state (not the entire store)?
4. **Persistence** — is any state persisted to AsyncStorage? Should it be?
5. **Type safety** — is the store fully typed?
6. **Stale state** — are there store fields that are set but never read?
7. **Missing state** — are there pieces of app state managed in local useState that should be global?

---

### DIMENSION 9: NAVIGATION & ROUTING

**What to check:**
1. Read `apps/mobile/app/_layout.tsx` — the root layout
2. Read `apps/mobile/app/(tabs)/_layout.tsx` — tab configuration
3. Read `apps/mobile/app/(screens)/_layout.tsx` — screen stack configuration
4. Read `apps/mobile/app/(auth)/_layout.tsx` — auth flow

**Specific checks:**
1. **Auth flow** — can unauthenticated users access the feed? (Anonymous browsing from Batch 1)
2. **Deep linking** — are all major screens reachable via URL? Check `expo-router` route definitions.
3. **Tab bar** — correct 5 tabs (Saf, Majlis, Risalah, Bakra, Minbar)? Correct icons? Badge counts?
4. **Screen transitions** — default push/pop? Any custom transitions?
5. **Back behavior** — does back always work? Any screens where back is broken or leads to wrong screen?
6. **Route type safety** — are route params typed? Search for `as never` route casts (known limitation, but count them).
7. **Orphan screens** — are there screen files that are not reachable from any navigation path? How would a user get to `scholar-verification.tsx` or `eid-cards.tsx`?

---

### DIMENSION 10: INTERNATIONALIZATION DEPTH

**What to check:**
1. Read ALL 8 language files: `en.json`, `ar.json`, `tr.json`, `ur.json`, `bn.json`, `fr.json`, `id.json`, `ms.json`
2. Run the audit script: `node apps/mobile/scripts/audit-i18n.js`

**Specific checks:**
1. **Key parity** — all 8 files must have identical key sets. ANY missing key = P1.
2. **Interpolation variables** — every `{{variable}}` in `en.json` must exist in all 7 other files. Missing = P1 (crash at runtime).
3. **Empty values** — any key with `""` empty string value = P2.
4. **Untranslated** — any value in a non-English file that's identical to the English value = P2 (likely untranslated).
5. **Arabic RTL** — check 20 random Arabic values for proper text direction. Mixed Arabic+numbers should have directional markers if needed.
6. **Pluralization** — does the app handle plural forms? (Arabic has 6 plural forms — singular, dual, plural few, plural many, etc.)
7. **Date/time/number formatting** — are dates, times, and numbers formatted per locale? Or always English format?
8. **Islamic terminology consistency** — check these terms across all 8 languages:
   - "Salah" / "Prayer" — is usage consistent within each language?
   - "Du'a" / "Supplication"
   - "Jumu'ah" / "Friday Prayer"
   - "Quran" — should never be translated, always "Quran" or "القرآن"
   - "Ramadan", "Hajj", "Eid" — universal or localized?

---

### DIMENSION 11: REAL-TIME SYSTEM (SOCKET.IO)

**What to check:**
Read `apps/api/src/gateways/chat.gateway.ts` completely. Also read any DTO files in `src/gateways/dto/`.

1. **Authentication** — is the JWT verified on connection? Can unauthenticated users connect?
2. **Room management** — how are conversation rooms joined/left? Any room leak (joining without leaving)?
3. **Event handling** — list every event the gateway handles. For each:
   - Is the payload validated?
   - Is the sender authorized (member of conversation)?
   - Is the response properly formatted?
4. **Typing indicators** — do they work? Is there a timeout (auto-stop after 5s)?
5. **Presence tracking** — is online/offline status tracked? How? Redis or in-memory?
6. **Message delivery** — is delivery confirmed? Read receipts?
7. **Reconnection** — what happens when a client disconnects and reconnects? Do they miss messages?
8. **Quran rooms** — how do they work? Audio streaming? Text follow-along?
9. **Call signaling** — is there WebRTC signaling? Or just database records?
10. **Scaling** — is the Redis adapter configured for multi-instance deployment? Check `apps/api/src/config/socket-io-adapter.ts`.

---

### DIMENSION 12: SECURITY & PRIVACY

**What to check:**

1. **Authentication audit:**
   - Read `apps/api/src/common/guards/clerk-auth.guard.ts` — how does it verify JWTs?
   - Read `apps/api/src/common/guards/optional-clerk-auth.guard.ts` — what happens if token is invalid vs missing?
   - Read `apps/api/src/modules/auth/webhooks.controller.ts` — how are Clerk webhooks verified?
   - Check: can any endpoint be accessed without auth that shouldn't be?

2. **Authorization audit:**
   - For each write endpoint: does it verify the requesting user owns the resource they're modifying?
   - Example: can User A edit User B's post? Check `posts.service.ts` update/delete methods.
   - Can User A read User B's private messages? Check `messages.service.ts`.
   - Can a non-admin access admin endpoints?

3. **Input validation:**
   - Check 10 random DTOs — do they have proper validation decorators?
   - Check for SQL injection risk — are there any raw SQL queries with string concatenation? (Note: `$executeRaw` tagged templates are safe per CLAUDE.md)
   - Check for XSS — is user content sanitized before storage/display?

4. **Encryption:**
   - Read `encryption.service.ts` completely — what does it actually encrypt?
   - Are messages encrypted at rest in the database? Or only in transit?
   - Are encryption keys properly managed?

5. **Data exposure:**
   - Do any endpoints return more data than needed? (e.g., returning password hashes, internal IDs, other users' emails)
   - Are `select` clauses used to limit returned fields?

6. **Rate limiting:**
   - Verify ALL 81 controllers have rate limiting
   - Check sensitive endpoints (login, password reset, search) have stricter limits

7. **CORS:**
   - Read `apps/api/src/main.ts` — what origins are allowed?
   - Is `*` used? (P1 in production)

8. **Environment variables:**
   - Read `.env.example` — are all secrets properly documented?
   - Check no secrets are hardcoded in source files

---

### DIMENSION 13: TESTING DEPTH

**What to check:**
Read at minimum 20 test files. For each:

1. **Coverage quality** — does it test actual logic or just "service is defined"?
2. **Mock quality** — are mocks realistic? Or using `as any` for everything?
3. **Edge cases** — does it test error paths? Unauthorized access? Invalid input?
4. **Missing tests** — for each module, check if a test file exists. List modules with no tests.
5. **Test isolation** — do tests depend on each other? Can they run in any order?
6. **Snapshot testing** — is it used? Should it be?

**Key test files to read deeply:**
- `feed.service.spec.ts`
- `messages.service.spec.ts`
- `posts.service.spec.ts`
- `users.service.spec.ts`
- `threads.service.spec.ts`
- `islamic.service.spec.ts`
- `encryption.service.spec.ts`
- `chat.gateway.spec.ts`

**Run the full test suite** and record: total suites, total tests, pass rate, any warnings.

---

### DIMENSION 14: ISLAMIC FEATURES DEPTH

This is Mizanly's core differentiator. Audit it ruthlessly.

**What to check:**

1. **Prayer times:**
   - Read `islamic.service.ts` — how are prayer times calculated? External API or local calculation?
   - Are times accurate for the user's location?
   - Do 8 calculation methods actually produce different results?
   - Do 6 adhan reciters actually have different audio URLs?

2. **Quran:**
   - Read Quran-related code — is there actual Quran text data? Or just placeholder?
   - Do the 4 reciters have real audio source URLs?
   - Does the reading plan actually track progress?
   - Does tafsir viewer have real tafsir content?

3. **Hadith:**
   - Read `apps/api/src/modules/islamic/data/hadiths.json` — how many hadiths? Are they authentic? Do they have proper source references (Bukhari, Muslim, etc.)?

4. **Dua collection:**
   - Read `apps/api/src/modules/islamic/data/duas.json` — how many duas? Are they categorized? Do they have Arabic + transliteration + translation + source?
   - Are there at least 5 duas per major category (morning, evening, eating, travel, etc.)?

5. **99 Names:**
   - Read `apps/api/src/modules/islamic/data/asma-ul-husna.json` — are all 99 names present? Do they have Arabic, transliteration, English meaning, and explanation?

6. **Fasting tracker:**
   - Does it calculate iftar/suhoor times based on location?
   - Can it track Sunnah fasts (Monday/Thursday)?
   - Does it integrate with gamification (XP for streaks)?

7. **Zakat calculator:**
   - Is it multi-asset (gold, silver, cash, stocks, property)?
   - Is the nisab threshold correct and dynamic (based on current gold/silver prices)?
   - Does it use Decimal arithmetic (not Float)?

8. **Mosque finder:**
   - What's the data source? Database only or external API?
   - If database only — is there seed data? How many mosques?

9. **Halal finder:**
   - Same question — data source? Seed data?
   - How many restaurants in the database?

10. **Morning briefing:**
    - Read `morning-briefing.tsx` — does it actually pull prayer times, hadith, ayah, dua?
    - Does the dhikr challenge actually count and award XP?

11. **Islamic calendar theming:**
    - Read `islamicThemes.ts` — are the 5 themes visually distinct?
    - Read `useIslamicTheme.ts` — does Hijri date detection work?
    - Is it actually wired in `_layout.tsx`?

12. **Hajj companion:**
    - Read `hajj-companion.tsx` and `hajj-step.tsx` — is there real Hajj guide content?
    - Read `apps/api/src/modules/islamic/data/hajj-guide.json` — is it comprehensive?

---

### DIMENSION 15: COMPETITOR FEATURE-BY-FEATURE COMPARISON

**This is the research-heavy section.** For each of Mizanly's 5 spaces, do a deep comparison against the real competitor app.

**Saf (Instagram) — Check these features:**
1. Feed algorithm — does Saf have: For You / Following tabs? Trending fallback for new users?
2. Stories — creation, viewing, highlights, interactive stickers (poll, question, quiz, countdown, emoji slider)?
3. Post creation — photo/video, filters, caption, hashtags, mentions, location?
4. Post interactions — like (double-tap), comment, share, save, report?
5. Profile — bio, avatar, cover, follower/following counts, post grid, story highlights?
6. Explore/Discover — trending content, search, hashtag feeds?
7. What Instagram has that Saf doesn't — Reels tab in feed, Shopping, Guides, Collab posts, Close Friends stories, Notes, Broadcast Channels?

**Bakra (TikTok) — Check these features:**
1. Video feed — full-screen vertical scroll? Autoplay? Sound on by default?
2. Video creation — record, trim, speed, effects, music, text, filters?
3. Duet/Stitch — do they actually work?
4. Sound page — tap a sound → see all videos using it?
5. Video interactions — like, comment, share, save, duet, stitch?
6. What TikTok has that Bakra doesn't — LIVE shopping, Creator Marketplace, Photo mode, Playlists, Series?

**Majlis (X/Twitter) — Check these features:**
1. Thread creation — text, media, polls?
2. Thread interactions — like, reply, repost, quote, bookmark?
3. Thread feed — For You / Following / Trending tabs?
4. Lists — create lists of accounts to follow?
5. What X has that Majlis doesn't — Spaces (live audio), Communities, X Premium features, Grok AI, Video tab?

**Risalah (WhatsApp) — Check these features:**
1. DM — text, voice message, image, video, file, location, contact?
2. Group chat — create, admin controls, member management?
3. Voice/video calls — do they actually work (WebRTC)?
4. Status (Stories) — 24h disappearing status updates?
5. Encryption — E2E? Safety numbers? Key verification?
6. What WhatsApp has that Risalah doesn't — Channels, Communities, Business API, Payments, Flows?

**Minbar (YouTube) — Check these features:**
1. Video upload — long-form, thumbnail, title, description, tags?
2. Video player — play/pause, seek, speed, quality, PiP, fullscreen?
3. Playlists — create, add videos, reorder?
4. Comments — threaded? Like/dislike? Pin?
5. Creator dashboard — analytics, revenue, subscribers?
6. What YouTube has that Minbar doesn't — Shorts, Live, Premiere, Memberships, Super Chat, Community posts, YouTube Music?

**For each comparison, produce a table:**
| Feature | Competitor | Mizanly Has? | Quality (1-10) | Gap Description |
|---------|-----------|-------------|----------------|-----------------|

---

### DIMENSION 16: THIRD-PARTY INTEGRATION STATUS

**What to check:**
For every third-party service in `.env.example`, verify:

1. **Is the SDK installed?** (check package.json)
2. **Is there actual integration code?** (not just env var reference)
3. **Does it have a fallback if the service is unavailable?**
4. **Has it been tested with real credentials?**

**Services to verify:**
- Clerk (auth)
- Neon PostgreSQL (database)
- Cloudflare R2 (storage)
- Cloudflare Stream (video)
- Cloudflare Images
- Upstash Redis (cache)
- Stripe (payments)
- Anthropic Claude (AI)
- OpenAI Whisper (transcription)
- Gemini (embeddings)
- Meilisearch (search)
- Resend (email)
- Sentry (monitoring)
- Expo Push (notifications)
- Firebase/FCM (Android push)
- TURN server (WebRTC)

For each, document: installed? integrated? fallback? tested? status (working/partial/broken/missing).

---

### DIMENSION 17: PERFORMANCE AUDIT

**What to check:**

1. **Database queries:**
   - Read the 5 heaviest services (feed, messages, posts, threads, search)
   - Identify queries that could be slow at scale (full table scans, missing indexes, no pagination)
   - Check for `findMany` without `take` (unbounded queries)

2. **Frontend performance:**
   - Are lists using `FlatList` with proper `keyExtractor`, `getItemLayout`, `maxToRenderPerBatch`?
   - Are heavy components wrapped in `React.memo`?
   - Are images using `expo-image` with caching?
   - Are there any inline `renderItem` functions that should be extracted?
   - Is Hermes engine enabled?

3. **Bundle size:**
   - Are all 8 language files loaded at startup? (Should lazy-load)
   - Are there unused dependencies in package.json?
   - Are screens lazy-loaded?

4. **API response size:**
   - Do endpoints use `select` to return minimal data?
   - Are there endpoints returning full user objects when only id+name is needed?

5. **Caching:**
   - What's cached in Redis? What should be but isn't?
   - What's cached on mobile? (feedCache, AsyncStorage)
   - Are cache TTLs appropriate?

---

### DIMENSION 18: ACCESSIBILITY COMPLIANCE

**What to check:**

1. **Read 20 screens** and verify every interactive element has:
   - `accessibilityLabel`
   - `accessibilityRole`
   - `accessibilityHint` (for non-obvious actions)

2. **Color contrast:**
   - Check the 5 most common text/background combinations against WCAG AA (4.5:1):
     - `colors.text.primary` (#FFF) on `colors.dark.bg` (#0D1117)
     - `colors.text.secondary` (#8B949E) on `colors.dark.bg` (#0D1117)
     - `colors.text.tertiary` (#6E7781) on `colors.dark.bg` (#0D1117)
     - `colors.emerald` (#0A7B4F) on `colors.dark.bg` (#0D1117)
     - `colors.gold` (#C8963E) on `colors.dark.bg` (#0D1117)

3. **Touch targets:**
   - Are all tappable elements at least 44x44 points?
   - Check 10 screens for small icons without `hitSlop`

4. **Font scaling:**
   - Is `maxFontSizeMultiplier` set? (Should be — set to 1.5x in Batch 1)
   - Would the layout break at 1.5x font size?

5. **Reduced motion:**
   - Does the app respect `prefers-reduced-motion`?
   - Can animations be disabled?

---

### DIMENSION 19: ERROR HANDLING & EDGE CASES

**What to check:**

1. **API error responses:**
   - Read `apps/api/src/common/filters/http-exception.filter.ts` — how are errors formatted?
   - Are all errors consistent format?
   - Are 500 errors logged to Sentry?

2. **Network failure on mobile:**
   - What happens when API is unreachable? Does the app crash or show an error?
   - Does the offline banner appear?
   - Can the user retry failed requests?

3. **Auth expiry:**
   - What happens when the Clerk JWT expires mid-session?
   - Does the app redirect to login? Or show cryptic 401 errors?
   - Is there a token refresh mechanism?

4. **Edge cases to verify:**
   - What happens if a user has 0 posts, 0 followers, 0 following? (Empty profile)
   - What happens if a post has 0 comments? 10,000 comments?
   - What happens if a conversation has 0 messages?
   - What happens if the feed returns 0 results?
   - What if someone sends a message with 10,000 characters?
   - What if someone uploads a 500MB video?
   - What happens on the 7th language if a key is missing in that language file?

---

### DIMENSION 20: CODE QUALITY & TYPESCRIPT STRICTNESS

**What to check:**

1. **`any` types:** Search for `as any` in non-test code. Count = must be 0.
2. **`@ts-ignore` / `@ts-expect-error`:** Search in non-test code. Count = must be 0.
3. **`as never`:** Count all instances. These are route cast workarounds — document the count.
4. **`console.log`:** Search for `console.log` in non-test, non-debug code. Should be 0 or wrapped in `__DEV__`.
5. **`TODO` / `FIXME`:** Search across entire codebase. Count and list each one.
6. **Dead imports:** Check 20 random files for unused imports.
7. **Inconsistent naming:** Check for mixed naming conventions (camelCase vs snake_case, `isX` vs `hasX`).
8. **Magic numbers:** Check for hardcoded numbers that should be constants (timeouts, limits, thresholds).

---

### DIMENSION 21: DATA INTEGRITY & MIGRATION SAFETY

**What to check:**

1. **Prisma migrations:**
   - Read `apps/api/prisma/migrations/` — how many migrations exist?
   - Is there a clean migration path from empty database to current schema?
   - Are there any destructive migrations (dropping columns/tables)?

2. **Seed data:**
   - Is there a seed script? What data does it create?
   - Would the app be functional on a completely empty database?
   - Islamic data files (hadiths.json, duas.json, asma-ul-husna.json, hajj-guide.json) — are they complete?

3. **Soft deletes:**
   - Are deletions soft (setting `isRemoved: true`) or hard (actually deleting rows)?
   - Is soft-deleted content properly excluded from all queries?

---

### DIMENSION 22: DEPLOYMENT & INFRASTRUCTURE

**What to check:**

1. **Railway deployment:**
   - Is there a `Procfile`, `railway.toml`, or `nixpacks.toml`?
   - What's the start command?
   - Is the health check endpoint working?

2. **Environment configuration:**
   - Are all required env vars documented in `.env.example`?
   - Are there env vars in code that aren't in `.env.example`?

3. **Database:**
   - Is Neon connection configured for both pooled and direct URLs?
   - Is connection pooling configured?

4. **CI/CD:**
   - Read `scripts/ci-test.sh` and `scripts/ci-lint.sh` — are they comprehensive?
   - Is there a GitHub Actions workflow?

5. **Monitoring:**
   - Read Sentry configuration — is it properly initialized on both API and mobile?
   - Are source maps configured for readable stack traces?

---

### DIMENSION 23: MONETIZATION READINESS

**What to check:**

1. **Stripe integration:**
   - Read `payments.service.ts` — can it create customers, process payments?
   - Read `stripe-connect.service.ts` — can it onboard creators?
   - Read `stripe-webhook.controller.ts` — does it handle webhooks properly?
   - Is Stripe in test mode or live mode?

2. **Virtual currency:**
   - Read the gift/coin models — is the buy→gift→cashout flow complete?
   - Is there fraud detection? Can someone self-gift?

3. **Promoted posts:**
   - Read `promotions.service.ts` — can a post be boosted? Is budget tracked?
   - Is there ad delivery logic in the feed?

4. **Membership tiers:**
   - Can a creator set up paid tiers?
   - Can a user subscribe?
   - Does subscriber-only content work?

---

### DIMENSION 24: BRANDING & MARKETING READINESS

**What to check:**

1. **App icon** — does a production-ready icon exist? (1024x1024 PNG)
2. **Splash screen** — is it configured in app.json?
3. **App Store metadata** — does `apps/mobile/app-store-metadata/metadata.json` exist with description, keywords, category?
4. **Privacy policy** — is there a URL?
5. **Terms of service** — is there a URL?
6. **Notification sounds** — are there custom sounds? Or just placeholders?
7. **Landing page** — is there a web landing page?
8. **Open Graph** — does sharing a Mizanly link produce a rich preview card?

---

### DIMENSION 25: COMPREHENSIVE COMPETITOR RESEARCH

**This is the research dimension.** Use web search extensively.

1. **UpScrolled (March 2026):**
   - What's their current user count?
   - What features have they added since February?
   - Are they still struggling with moderation?
   - Have they added any Islamic features?
   - What's their App Store rating now?

2. **Muslim Pro (March 2026):**
   - Any new features?
   - Have they improved their social features?
   - What's their download count now?
   - Are they a potential acquirer or competitor?

3. **Instagram (March 2026):**
   - Any new features since our last research?
   - Flipside update? Short dramas?
   - New creator tools?

4. **TikTok (March 2026):**
   - Local feed update?
   - Shop features?
   - US ownership status?

5. **Other Muslim apps:**
   - Alfafaa, Muslamica, Deenify, Ummah — any growth or new features?
   - Any NEW Muslim social apps launched?

6. **Emerging trends:**
   - AI integration in social apps
   - Decentralized social (Bluesky, Mastodon)
   - Short-form video evolution
   - Creator economy changes
   - Privacy legislation (EU Digital Services Act, etc.)

**For each competitor, produce:**
- Feature count comparison table
- Strengths Mizanly has over them
- Strengths they have over Mizanly
- Strategic recommendation

---

## FINAL DELIVERABLE

After completing ALL 25 dimensions, produce:

1. **`docs/audit/COMPREHENSIVE_AUDIT_2026.md`** — full audit report with all findings
2. **`docs/audit/PRIORITY_FIXES.md`** — all P0 and P1 items sorted by severity
3. **`docs/audit/COMPETITOR_MATRIX.md`** — feature comparison tables
4. **`docs/audit/HONEST_SCORES.md`** — per-dimension scores with evidence

**Commit all audit documents when complete.**

---

## EXECUTION ORDER

1. Start with Dimension 1 (Schema) — it's the foundation everything depends on
2. Then Dimensions 2-3 (Backend logic + Controllers) — the core API
3. Then Dimensions 4-6 (Mobile screens + Components + Hooks) — the user-facing app
4. Then Dimensions 7-11 (Services, State, Navigation, i18n, Sockets) — the glue
5. Then Dimensions 12-13 (Security + Testing) — trust & safety
6. Then Dimension 14 (Islamic features) — the differentiator
7. Then Dimensions 15-25 (Competitor, Performance, a11y, etc.) — the context

**If you run out of context window:**
- Commit findings so far to `docs/audit/COMPREHENSIVE_AUDIT_2026.md`
- Note exactly which dimension you stopped at
- The user will start a new session to continue from that point

---

## REMEMBER

- **You are not here to praise the app.** You are here to find every flaw, inconsistency, and gap.
- **"Looks good" is not a finding.** Specific file, specific line, specific issue.
- **Compare against Instagram/TikTok, not against "does the file exist."**
- **If it would embarrass you in a code review, flag it.**
- **The user handles harsh criticism well. They WANT it. Sugarcoating disrespects them.**

**BEGIN.**
