# Audit Dimensions — What to Check on EVERY File

## D1: Code Quality & TypeScript Safety
- `as any` usage (FORBIDDEN in non-test code)
- `@ts-ignore` / `@ts-expect-error` (FORBIDDEN)
- Unused imports or variables
- Missing return types on exported functions
- Raw `console.log` without `__DEV__` guard
- Hardcoded strings that should be i18n keys
- Dead code / unreachable branches
- Missing error handling on async operations
- `any` type in function parameters or return types

## D2: UI Component Compliance (Mobile Only)
- `Modal` from react-native (MUST be `<BottomSheet>`)
- Bare `<ActivityIndicator>` (MUST be `<Skeleton.*>` except in buttons)
- Bare "No items" / "No data" text (MUST be `<EmptyState>`)
- Text emoji for icons like ←, ✕, ✓ (MUST be `<Icon name="...">`)
- Hardcoded `borderRadius` >= 6 (MUST be `radius.*` from theme)
- CSS `linear-gradient(...)` string (MUST be `expo-linear-gradient`)
- Missing `<RefreshControl>` on FlatList/FlashList
- Hardcoded color values (MUST use `colors.*` from theme)
- Hardcoded spacing values (MUST use `spacing.*` from theme)
- Hardcoded font sizes (MUST use `fontSize.*` from theme)
- Missing `accessibilityLabel` on pressable/touchable elements
- Missing `accessibilityRole` on buttons

## D3: Performance
- Unbounded database queries (missing `take` limit on findMany)
- Missing `React.memo` on list item components
- Inline function definitions in `renderItem` (should be extracted)
- Missing `useCallback`/`useMemo` where re-renders are likely
- Large images without caching (should use Expo Image or FastImage)
- Missing `keyExtractor` on FlatList/FlashList
- Missing `estimatedItemSize` on FlashList
- N+1 query patterns in services (loading relations in loops)
- Missing database indexes on frequently queried fields
- Synchronous operations that should be async

## D4: Security
- SQL injection risk (raw queries without parameterization)
- Missing auth guard on protected endpoints
- Missing input validation (DTOs without class-validator decorators)
- Secrets/API keys hardcoded in source
- Missing rate limiting on sensitive endpoints
- Missing CSRF protection
- Overly permissive CORS configuration
- User data exposed without ownership check (can user A see user B's private data?)
- Missing `@CurrentUser('id')` — using full user object unnecessarily
- File upload without type/size validation

## D5: Accessibility
- Missing `accessibilityLabel` on interactive elements
- Missing `accessibilityRole` (button, link, image, header, etc.)
- Missing `accessibilityHint` on non-obvious actions
- Color contrast violations (text on background < 4.5:1 ratio)
- Touch targets < 44pt
- Images without alt text / accessibility description
- Non-descriptive button text ("Click here" instead of "Share post")
- Missing keyboard navigation support (web)
- Animations without reduced-motion respect

## D6: Internationalization
- Hardcoded English strings (should be `t('key')`)
- Missing translation keys in en.json
- Date formatting without locale awareness
- Number formatting without locale
- Currency formatting without locale
- RTL layout issues (flexDirection, margins, padding, icons)
- Text truncation that breaks in Arabic (longer text)
- Hardcoded "left"/"right" instead of "start"/"end"

## D7: Error Handling
- Missing try/catch on API calls
- Missing error boundaries on screens
- Missing loading states
- Missing empty states
- Missing offline handling
- Network errors not caught
- Missing toast/snackbar for user feedback on errors
- Swallowed errors (catch with no action)
- Missing retry logic on transient failures

## D8: Architecture & Patterns
- Screens importing from wrong layer (screen → screen, instead of screen → component)
- Business logic in UI components (should be in services/hooks)
- Duplicated code across screens
- Missing Zustand store usage where state is shared
- API calls directly in components instead of through service files
- Missing query invalidation after mutations
- Missing optimistic updates on user actions
- Socket events not cleaned up on unmount
- Missing navigation cleanup on screen unmount

## D9: API Design
- Missing pagination on list endpoints
- Missing cursor-based pagination (using offset instead)
- Missing `@Throttle` decorator on public endpoints
- Inconsistent response format
- Missing Swagger/OpenAPI decorators
- Overly broad data selection (returning unnecessary fields)
- Missing `select` on Prisma queries (selecting entire model when only needing 2 fields)
- DELETE endpoints not checking ownership
- Missing idempotency on create endpoints

## D10: Testing
- Service file without corresponding .spec.ts
- Test file with no actual assertions (empty tests)
- Mock data using `as any` where proper typing would work
- Missing edge case tests (empty input, null, boundary values)
- Missing error path tests

## D11: Islamic Feature Correctness
- Prayer time calculations — are they using proper astronomical methods?
- Hijri date conversion — is it accurate?
- Qibla direction — correct formula?
- Quran text — is it from a verified source?
- Hadith attribution — correct collections referenced?
- Zakat calculation — follows fiqh rules?
- Ramadan timing — accurate for user's location?

## D12: Real-time & Socket
- Missing socket event cleanup on disconnect
- Missing socket authentication verification
- Race conditions in concurrent message handling
- Missing message deduplication
- Missing typing indicator timeout
- Missing presence timeout (user goes offline but still shows online)

## D13: Media & Storage
- Missing media type validation on upload
- Missing file size limits
- Missing thumbnail generation for videos
- Missing media compression
- Missing presigned URL expiry
- Missing R2 lifecycle rules for temporary uploads

## D14: Monetization & Payments
- Missing Stripe webhook signature verification
- Missing idempotency keys on payment operations
- Missing error handling on payment failures
- Missing refund logic
- Price amounts hardcoded instead of configurable
- Missing currency conversion

## D15: Navigation & Routing
- Screens not reachable from any navigation flow (orphaned)
- Missing deep link handling
- Missing back button handling
- Missing screen transition animations
- Tab state not preserved on switch
- Missing scroll restoration on back navigation

## D16: Cross-Space Compatibility (THE 5-SPACE AUDIT)

Mizanly's core promise is 5 apps in 1. Every space must work seamlessly with every other space. Audit EVERY screen for cross-space interactions:

### Saf (Instagram) ↔ Other Spaces
- Can a Saf post be shared to Majlis as a thread? (cross-post)
- Can a Saf post be sent in Risalah DM? (share to chat)
- Can a Saf story mention a Bakra reel? (cross-reference)
- Can a Saf carousel be reposted on Minbar as a slideshow video?
- Does Saf feed show content from followed Minbar channels?
- Do Saf profile links work for users who only post on Majlis?
- Is PostCard component reusable across spaces or duplicated?

### Bakra (TikTok) ↔ Other Spaces
- Can a Bakra reel be shared as a Saf post? (cross-post to feed)
- Can Bakra reels be embedded in Majlis threads?
- Can Bakra videos be forwarded in Risalah conversations?
- Can Bakra audio/sounds be used in Saf stories?
- Does duet/stitch reference work cross-space (reel duet of a Saf video)?
- Can Bakra creators be discovered via Minbar recommendations?
- Does the Bakra algorithm consider Saf/Majlis engagement signals?

### Majlis (X/Twitter) ↔ Other Spaces
- Can a Majlis thread quote a Saf post? (embed post in thread)
- Can Majlis polls be shared to Risalah groups?
- Can Majlis trending topics surface content from all spaces?
- Can a Majlis thread link to a Minbar video with inline preview?
- Does Majlis discovery show cross-space trending content?
- Can a Majlis thread be converted to a Bakra video script?
- Do @mentions work cross-space (mention a creator from any space)?

### Risalah (WhatsApp) ↔ Other Spaces
- Can any content from any space be forwarded via Risalah?
- Does share sheet show "Send via Risalah" for all content types?
- Can Risalah group links be shared on Saf/Majlis profiles?
- Do media previews work when sharing Bakra reels in chat?
- Can Risalah voice messages be posted as voice posts on Majlis?
- Does Risalah show "shared from Saf/Bakra/Majlis/Minbar" attribution?
- Can communities in Risalah connect to Minbar channels?

### Minbar (YouTube) ↔ Other Spaces
- Can Minbar videos be clipped and shared as Bakra reels?
- Can Minbar video comments link to Majlis discussion threads?
- Can Minbar channel posts appear in Saf feed?
- Can Minbar live streams be announced in Risalah groups?
- Do Minbar playlists support content from Bakra (short + long)?
- Can Minbar creators cross-post community updates to Majlis?
- Does Minbar recommendation engine consider cross-space engagement?

### Universal Cross-Space Checks
- **Unified notification system** — do notifications from all spaces appear in one feed?
- **Unified search** — does search find content across all 5 spaces?
- **Unified profile** — does one profile show content from all spaces (posts, reels, threads, channels)?
- **Cross-space analytics** — does creator dashboard aggregate stats from all spaces?
- **Content graph** — is there a cross-space content link (post in Saf → discussed in Majlis → shared in Risalah)?
- **Consistent user identity** — same avatar, verified badge, display name across all spaces?
- **Create sheet** — does the create flow support all content types from one entry point?
- **Deep links** — do deep links route correctly to the right space?
- **Offline cache** — does offline mode work consistently across all spaces?
- **RTL** — is RTL layout consistent across all 5 spaces?
- **Theme** — is dark mode, glassmorphism, emerald/gold consistent across all spaces?

## D17: Deep Competitor Parity Audit

For EVERY feature in every screen, check: does this match or exceed what the best competitor offers? Score each screen 1-10 against its primary competitor.

### vs Instagram (Saf screens)
Check every Saf screen against Instagram 2026:
- Feed: algorithm ranking, suggested posts interleaved, "You're all caught up"
- Stories: interactive stickers (poll, quiz, countdown, emoji slider, question, add yours), music, link, mention, location stickers, drawing tools, text effects, story highlights, close friends, story archive
- Reels tab: full-screen swipe, sound page, remix, templates, effects browser
- Profile: highlights grid, bio links, story ring, collab indicator, account switching, professional dashboard
- Create: multi-image carousel, filters, editing tools, scheduling, collab invite, location, hashtag suggestions, alt text
- Explore: mixed media grid, category tabs, search suggestions, trending
- DM: vanish mode, voice messages, reactions, GIF, shared media gallery
- Shopping: product tags, in-app checkout, creator storefronts
- Notifications: activity feed with grouped notifications, follow suggestions
- Settings: privacy controls, two-factor, blocked accounts, data download

### vs TikTok (Bakra screens)
Check every Bakra screen against TikTok 2026:
- FYP: interest-graph algorithm, completion-rate-driven ranking, not-interested feedback
- Video player: double-tap like, floating hearts, comment overlay, share sheet, sound link, creator follow
- Create: 60s/3min/10min recording, speed controls, timer, filters, effects, green screen, duet, stitch, voiceover, auto-captions, music library with trending sounds, transitions
- Sound page: all videos using this sound, save sound, use sound
- Comments: nested replies, liked by creator badge, pinned comments, video replies
- Profile: video grid, liked videos, saved sounds, analytics
- Live: gifts, viewer count, comments, multi-guest, shopping
- Search: users, videos, sounds, hashtags, live
- Series: paywall episodic content, subscribe to series
- Effects: AR filters, trending effects, Islamic-themed effects
- Analytics: views, followers, content performance, traffic sources

### vs X/Twitter (Majlis screens)
Check every Majlis screen against X 2026:
- Timeline: For You + Following tabs, algorithm + chronological toggle
- Threads: chain threads, quote post, repost, like, bookmark, share, view count
- Replies: nested replies, hide reply, conversation muting
- Spaces: audio rooms, speaker queue, recording, scheduling
- Communities: community pages, rules, moderation, member roles
- Lists: custom lists, follow lists, list timeline
- Search: trending, for you, news, live, people tabs
- Profile: pinned post, highlights, media tab, likes tab, subscriber content
- Notifications: mentions, retweets, likes, follows, grouped
- Grok integration: AI-powered replies, fact-checking, tone monitoring
- Subscriptions: paid subscriber content, subscriber badge, subscriber-only replies
- Analytics: impressions, engagement rate, follower growth, best posting times
- Polls: multi-option, duration, results display
- DMs: message requests, read receipts, voice messages, reactions

### vs WhatsApp (Risalah screens)
Check every Risalah screen against WhatsApp 2026:
- Chat: E2E encryption, disappearing messages, view-once, voice messages with speed control, reactions, replies, forwarding, starring, search in chat
- Groups: admin controls (permissions matrix, member approval, admin-only messages, ban), group description, member list, shared media, mute, topics
- Calls: voice/video calls, group calls (up to 32), screen sharing, call quality (TURN/STUN)
- Status: text + media status, privacy controls (my contacts, except, only share with), status replies
- Communities: announcement groups, sub-groups, community info, member management
- Channels: one-way broadcast, voice notes, quizzes, QR codes, reaction emoji
- Settings: privacy (last seen, profile photo, about, groups, status), blocked contacts, storage management, chat backup, notification tones, two-step verification
- Business features: catalog, quick replies, labels, away messages, greeting messages
- New 2026 features: group message history for new members, secret code chat lock, view-once voice messages, camera effects (30 backgrounds/filters), in-chat translation, member tags
- File sharing: documents, PDFs, contacts, location (live + static)
- Stickers: custom sticker maker, sticker packs, animated stickers

### vs YouTube (Minbar screens)
Check every Minbar screen against YouTube 2026:
- Home: recommendation feed, categories (trending, music, gaming, Islamic, etc.), Continue Watching
- Video player: quality selector, speed controls (0.25x-2x), PiP, mini player, ambient mode, theater mode, captions/subtitles, chapters, end screens, cards
- Shorts: vertical full-screen, swipe feed, comments, sound link, remix
- Subscriptions: channel list, notification bell, "All" vs "None" vs "Personalized"
- Library: watch history, playlists, downloads, watch later, liked videos
- Channel: about, videos grid, shorts grid, playlists, community tab, channel trailer, membership tiers
- Upload: title, description, tags, thumbnail, visibility, schedule, monetization, subtitles, end screen editor, cards editor
- Studio/analytics: views, watch time, revenue, audience demographics, real-time analytics, traffic sources
- Comments: threaded, heart, pin, creator reply, timestamp links
- Live: stream setup, chat, super chat/thanks, scheduling, premiere countdown
- Monetization: AdSense, memberships, Super Chat, merch shelf, YouTube Premium revenue share
- Playlists: collaborative, auto-generated, reorderable
- Notifications: uploads, live, community posts, recommendations
- Premium: ad-free, background play, downloads, YouTube Music

### vs Telegram (Risalah + general)
- Channels with unlimited subscribers vs Risalah broadcast
- Supergroups (200K members) vs Risalah groups
- Bots/Mini Apps platform vs Mizanly extensibility
- Telegram Stars payment system vs Mizanly virtual currency
- Chat folders for organizing conversations
- Saved messages (bookmark chat with yourself)
- Slow mode in groups
- Admin log (action history)
- Custom emoji in messages
- Scheduled messages
- Message editing with edit history
- Silent messages (no notification)
- Topics in groups (forum-style)
- Auto-delete timers per chat
- File sharing up to 2GB
- Secret chats with self-destruct timer
- Phone number privacy (username-only contact)

### vs WeChat (super app model)
- Mini programs → does Mizanly have any extensibility/plugin model?
- WeChat Pay → how does Mizanly's payment compare to WeChat's seamless in-app payments?
- Moments → does Saf feed work like Moments (friends-only by default)?
- WeChat Channels → does Minbar match WeChat's social video distribution?
- Official accounts → does Mizanly support brand/organization accounts?
- QR code everything → does Mizanly use QR codes for profile, payment, group join?
- Integrated search across messages, contacts, moments, mini programs, articles
- Sticker store → does Mizanly have a sticker ecosystem?
- Red packets (digital gifts) → similar to Mizanly's gift system?
- WeChat Work integration → does Mizanly consider business/community use?
- 60% open app 10+ times/day → what drives Mizanly's daily open rate?

### vs Discord (communities + voice)
- Server structure (channels, categories, roles) vs Mizanly communities
- Forum channels → threaded discussions within communities
- Stage channels → moderated audio events (vs Mizanly audio rooms)
- Activities → in-server games and apps
- Webhooks → external integrations
- Bot ecosystem → extensibility
- Voice channels (always-on drop-in) vs scheduled audio rooms
- Screen sharing in voice
- Server discovery → community discovery
- Nitro (premium) → subscriber perks
- Thread channels → temporary discussion branches
- Custom emoji & stickers per server
- Role-based permissions → granular access control
- Server boosts → community gamification

### vs Snapchat
- Snap Map → location sharing vs Mizanly mosque finder / friends map
- Memories → saved snaps vs Mizanly story archive
- Spotlight → TikTok-like feed (vs Bakra)
- Lenses/AR → face filters (vs Mizanly's planned AR)
- Bitmoji → avatar system (vs Mizanly AI avatar)
- Chat → ephemeral messaging (vs Risalah disappearing messages)
- Stories → 24h ephemeral (vs Saf stories)
- Discover → publisher content (vs Mizanly discover)

### vs Reddit
- Subreddits → Mizanly communities
- Upvote/downvote → engagement system
- Awards → virtual gifts
- AMAs → Q&A format (vs fatwa Q&A)
- Moderation tools → community moderation
- Wiki pages → community knowledge base
- Flairs → post categorization / member tags
- Karma → reputation system (vs Mizanly XP/levels)

### vs LinkedIn (professional context)
- Professional profiles → scholar verification, creator profiles
- Articles → long-form content (does Mizanly support long text posts?)
- Newsletters → channel subscriptions
- Events → Mizanly events feature
- Endorsements/skills → community reputation

### vs Signal (privacy)
- Signal Protocol → Mizanly encryption completeness
- Sealed sender → metadata protection
- Disappearing messages → timer accuracy
- Group encryption → all members have keys?
- Screen security → screenshot detection?
- Registration lock → 2FA on account recovery

### vs Threads (Meta)
- Fediverse/ActivityPub support → decentralization?
- Character limit → Mizanly thread length
- Re-share → quote post mechanism
- Following feed vs For You feed toggle
- Cross-posting to Instagram → Mizanly cross-space posting

### vs Clubhouse (audio)
- Audio rooms quality → Mizanly audio room quality
- Room discovery → trending rooms
- Replays → can audio rooms be recorded?
- Hallway → random room suggestions
- Clubs → recurring audio groups

### vs Muslim Pro / Quran.com (Islamic)
- Prayer time accuracy → which calculation method?
- Quran reading experience → audio recitation, multiple reciters, word-by-word translation
- Hadith collections → Bukhari, Muslim, Abu Dawud, Tirmidhi, etc.
- Dua collection → categorized duas
- Mosque finder accuracy → data source, coverage
- Zakat calculator → handles gold, silver, cash, stocks, crypto?
- Islamic calendar accuracy → Um al-Qura, calculated, or observed?
- Tafsir depth → multiple scholars, multiple languages
- Dhikr counter → customizable, goal tracking, social sharing
- Ramadan features → fasting tracker, suhoor/iftar alarms per location
