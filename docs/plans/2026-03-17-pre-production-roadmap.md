# Mizanly Pre-Production Roadmap — 191 Features to 100% Parity + Moat

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Mizanly on iOS, Android, and Web with full competitor parity against Instagram, TikTok, X, WhatsApp, and YouTube — plus 80+ moat features that make Mizanly the definitive platform for the global Muslim ummah.

**Architecture:** Expo SDK 52 (React Native) for all 3 platforms, NestJS backend on Railway, Neon PostgreSQL, Cloudflare R2/Stream for media, Clerk auth, Socket.io real-time, Meilisearch, Upstash Redis. Features organized into 12 tiers by priority — each tier is a batch wave of parallel agents.

**Tech Stack:** React Native (Expo), NestJS, Prisma, PostgreSQL, Redis, Socket.io, Stripe, Cloudflare R2/Stream, Clerk, Meilisearch, expo-notifications, expo-av, expo-camera, expo-linear-gradient, react-i18next

**Current State:** 121 screens, 49 backend modules, 81 Prisma models, 65 test files, 88/121 screens i18n'd. Batches 1-36 complete.

---

## TIER CLASSIFICATION

Features are classified into 12 tiers. **Tiers 1-4 are ship-blocking.** Tiers 5-8 are launch-week. Tiers 9-12 are month-one iteration.

---

## TIER 1: FOUNDATION — App Must Run (Ship-Blocking)
*Everything else depends on this. Zero features work if the app doesn't compile and run on all 3 platforms with real data.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 1 | **Finish i18n** — 33 remaining screens + fill ALL missing keys in en.json and ar.json | Mobile | ~600 | 37 |
| 2 | **RTL layout polish** — Arabic text alignment, mirrored navigation, flipped icons, RTL ScrollViews | Mobile | ~800 | 37 |
| 3 | **Replace remaining mock data** — 6 screens still using MOCK_ constants (account-switcher, appeal-moderation, audio-library, caption-editor, event-detail, quran-share) | Mobile | ~300 | 37 |
| 4 | **Expo Web configuration** — metro.config.js web aliases, web-specific responsive layouts, Platform.select for web-only UI, sidebar nav on web | Mobile | ~1000 | 37 |
| 5 | **Web responsive layout** — sidebar navigation on desktop, multi-column feed, responsive breakpoints, web keyboard shortcuts | Mobile/Web | ~1200 | 37 |
| 6 | **PWA support** — service worker, web manifest, offline shell, installable on desktop/mobile web | Mobile/Web | ~400 | 37 |
| 7 | **Deploy infra** — finish Railway API wiring, Neon DB connection, R2 bucket CORS, Redis connection, Meilisearch index setup, Clerk production keys, environment variables | DevOps | ~200 | 37 |
| 8 | **Comprehensive error boundaries** — wrap every screen with ErrorBoundary, offline detection banner, retry logic on all API calls | Mobile | ~500 | 37 |
| 9 | **Multi-account switching** — Clerk multi-session support, account picker, per-account push token registration | Mobile+API | ~600 | 37 |
| 10 | **Push notification E2E wiring** — verify FCM/APNs tokens register correctly, push.service.ts sends to Expo Push API, test on real devices, badge counts | API+Mobile | ~400 | 37 |
| 11 | **Story sticker wiring audit** — 5 sticker components exist (Poll, Quiz, Countdown, Question, Slider) but may not be fully wired to create-story.tsx and story-viewer.tsx. Verify + fix | Mobile | ~300 | 37 |
| 12 | **TURN server for calls** — configure TURN/STUN server for WebRTC calls (calls module exists but no TURN config), test call quality behind NAT | API+DevOps | ~300 | 37 |
| 13 | **Appeal moderation wiring** — appeal-moderation.tsx screen exists but verify it connects to moderation backend endpoints, test full flow | Mobile+API | ~200 | 37 |

**Tier 1 Total: 13 features, ~7,800 lines**

---

## TIER 2: CORE MEDIA PARITY — Video/Photo Creation Must Match (Ship-Blocking)
*Users open social apps to create and consume content. If creation tools are weak, they won't stay.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 10 | **Video trim/cut editor** — timeline scrubber, set in/out points, split clips, reorder segments | Mobile | ~800 | 38 |
| 11 | **Playback speed control** — 0.25x, 0.5x, 1x, 1.5x, 2x on all video screens | Mobile+API | ~200 | 38 |
| 12 | **Video quality selector** — auto/360p/720p/1080p toggle on video player | Mobile+API | ~300 | 38 |
| 13 | **Auto-captions** — speech-to-text via Whisper API, editable subtitle overlay, multi-language | API+Mobile | ~600 | 38 |
| 14 | **Text-to-speech on videos** — AI narration of caption overlay, multiple voice options | Mobile+API | ~400 | 38 |
| 15 | **Voiceover recording** — record audio over video in editor | Mobile | ~300 | 38 |
| 16 | **Speed ramping** — variable speed within single clip (slow-mo + fast segments) | Mobile | ~400 | 38 |
| 17 | **Video transitions library** — fade, slide, zoom, glitch between clips | Mobile | ~500 | 38 |
| 18 | **Sound sync** — auto-cut video clips to beat drops in selected audio | Mobile | ~600 | 38 |
| 19 | **Thumbnail customization** — upload custom thumbnail or select frame from video | Mobile+API | ~300 | 38 |
| 20 | **Boomerang / Layout camera modes** — boomerang loop, grid collage, superzoom | Mobile | ~500 | 38 |
| 21 | **Loop video toggle** — seamless loop playback option | Mobile | ~100 | 38 |
| 22 | **Volume normalization** — consistent audio levels across videos | Mobile | ~200 | 38 |

**Tier 2 Total: 13 features, ~5,200 lines**

---

## TIER 3: STORY & REEL PARITY — Interactive Content (Ship-Blocking)
*Stories and reels are the #1 engagement driver on IG and TikTok.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 23 | **Interactive stickers: poll, quiz, countdown, emoji slider, question box** — tap to respond, results shown to creator | Mobile+API | ~1200 | 39 |
| 24 | **Add Yours sticker** — story chain sticker, tap to add your own version | Mobile+API | ~400 | 39 |
| 25 | **Music overlay on stories** — audio track search, attach to story, music attribution | Mobile+API | ~500 | 39 |
| 26 | **Drawing tools** — freehand, shapes, highlighter, neon, eraser, color picker, size | Mobile | ~600 | 39 |
| 27 | **Text effects** — animated text (typewriter, fade-in, bounce), gradient text, outline text, shadow | Mobile | ~500 | 39 |
| 28 | **Interactive link stickers** — URL preview card in stories, tap to open | Mobile+API | ~300 | 39 |
| 29 | **Reel templates** — use another reel's timing structure as template for your own | Mobile+API | ~400 | 39 |
| 30 | **Reel remix** — reaction video beside original (side-by-side or green screen overlay) | Mobile+API | ~500 | 39 |
| 31 | **Duet/stitch mode** — split-screen side-by-side or use first 5s of another video | Mobile+API | ~600 | 39 |
| 32 | **Video replies to comments** — reply to a comment with a video, comment shown as overlay | Mobile+API | ~400 | 39 |
| 33 | **AR filters** — face tracking filters via expo-camera + ML Kit, Islamic-themed (thobe, hijab, mosque BG) | Mobile | ~800 | 39 |
| 34 | **Green screen** — chroma key compositing, custom backgrounds | Mobile | ~500 | 39 |
| 35 | **Photo mode with music** — carousel post with background audio track | Mobile+API | ~300 | 39 |
| 36 | **Disposable camera mode** — BeReal-style daily prompt, dual camera, no filters, 2-min window | Mobile+API | ~500 | 39 |

**Tier 3 Total: 14 features, ~7,500 lines**

---

## TIER 4: CHAT PARITY — Messaging Must Match WhatsApp (Ship-Blocking)
*Risalah is the WhatsApp space. If messaging is weak, users have no reason to leave WhatsApp.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 37 | **E2E encryption** — Signal protocol (libsignal), key exchange, encrypted message storage, verification | API+Mobile | ~2000 | 40 |
| 38 | **Disappearing messages** — timer-based auto-delete (24h, 7d, 90d), per-conversation toggle | API+Mobile | ~400 | 40 |
| 39 | **View-once media** — photo/video that disappears after viewing, screenshot detection | API+Mobile | ~400 | 40 |
| 40 | **Vanish mode** — ephemeral chat mode, all messages auto-delete when closed | API+Mobile | ~300 | 40 |
| 41 | **File sharing in chat** — PDF, docs, zip upload+download, file preview, size limits | API+Mobile | ~500 | 40 |
| 42 | **Contact sharing** — share a contact card in chat, tap to add | Mobile | ~200 | 40 |
| 43 | **Real-time location sharing** — live GPS sharing for set duration (15m, 1h, 8h) | API+Mobile | ~600 | 40 |
| 44 | **Message scheduling** — compose now, send later at specified time | API+Mobile | ~300 | 40 |
| 45 | **Chat lock** — biometric lock per conversation (Face ID / fingerprint) | Mobile | ~300 | 40 |
| 46 | **Chat wallpaper** — per-conversation custom background | Mobile | ~200 | 40 |
| 47 | **Chat backup/export** — export chat as text/HTML with media, backup to cloud | API+Mobile | ~500 | 40 |
| 48 | **Custom notification tones** — per contact/group notification sound | Mobile | ~200 | 40 |
| 49 | **Storage management** — show space used per conversation, clear cache, manage media | Mobile | ~400 | 40 |
| 50 | **Media auto-download settings** — WiFi only, never, always, per media type | Mobile | ~200 | 40 |
| 51 | **Status privacy controls** — share with my contacts / except / only share with | API+Mobile | ~300 | 40 |
| 52 | **Group admin tools** — permissions matrix, admin-only messages, member approval queue, ban | API+Mobile | ~600 | 40 |
| 53 | **Screen sharing in calls** — share screen during voice/video call | Mobile | ~500 | 40 |
| 54 | **Group video calls** — multi-participant video call (up to 8) | API+Mobile | ~800 | 40 |
| 55 | **Multi-device support** — phone + web active simultaneously, message sync | API+Mobile | ~1000 | 40 |
| 56 | **Custom sticker maker** — create stickers from photos, crop, add to personal pack | Mobile | ~400 | 40 |

**Tier 4 Total: 20 features, ~9,600 lines**

---

## TIER 5: DISCOVERY & FEED INTELLIGENCE (Launch Week)
*Users need to find content and people. Feed must be smart.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 57 | **Algorithm-ranked feed tuning** — engagement scoring, time decay, diversity controls, interest weighting | API | ~600 | 41 |
| 58 | **Content-based recommendations** — collaborative filtering, "users who liked X also liked Y" | API | ~500 | 41 |
| 59 | **Trending topics** — real-time hashtag velocity tracking, trending page with location filter | API+Mobile | ~500 | 41 |
| 60 | **Explore grid parity** — mixed media grid with category tabs (For You, Trending, Food, Islamic, Art, etc.) | Mobile | ~400 | 41 |
| 61 | **Topics/interests follow** — follow topics not just users, topic-based feed sections (schema exists, needs UI) | API+Mobile | ~400 | 41 |
| 62 | **AI-powered search** — natural language search ("Ramadan recipes from last week"), semantic matching | API | ~600 | 41 |
| 63 | **Search suggestions / autocomplete** — trending searches, recent searches, type-ahead | Mobile+API | ~300 | 41 |
| 64 | **"You're All Caught Up"** marker — show when you've seen all new content, suggest older posts below | Mobile | ~200 | 41 |
| 65 | **Favorites feed** — close friends' content prioritized in separate feed toggle | Mobile+API | ~300 | 41 |
| 66 | **Chronological feed option** — true chronological, no algorithm, user toggle per session | Mobile+API | ~200 | 41 |
| 67 | **Open algorithm** — show WHY each post appeared ("because you follow #quran", "trending in your city") | Mobile+API | ~400 | 41 |
| 68 | **Not interested / don't recommend** — exists in code, verify full flow working | Mobile+API | ~100 | 41 |

**Tier 5 Total: 12 features, ~4,500 lines**

---

## TIER 6: CREATOR ECONOMY & MONETIZATION (Launch Week)
*Creators drive content. Content drives users. Must incentivize creators from day one.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 69 | **Post insights** — per-post impressions, reach, saves, shares, demographics | API+Mobile | ~600 | 42 |
| 70 | **Creator analytics dashboard** — audience demographics, growth trends, best posting times, revenue | Mobile+API | ~800 | 42 |
| 71 | **Professional dashboard / Creator mode** — creator account type, monetization hub, brand tools | API+Mobile | ~500 | 42 |
| 72 | **Virtual gifts** — animated gifts during live/reels with real currency (coins → gems → cash out) | API+Mobile | ~800 | 42 |
| 73 | **LIVE gifts economy** — purchase coins, send during live, creator cashes out (coins → diamonds → $) | API+Mobile | ~600 | 42 |
| 74 | **Channel memberships wired** — tiers with perks, member badges, exclusive content, working billing | API+Mobile | ~500 | 42 |
| 75 | **Creator storefront** — each creator sets up shop within profile, halal product listings | API+Mobile | ~700 | 42 |
| 76 | **Livestream shopping** — sell during lives with one-tap purchase, product cards overlay | API+Mobile | ~600 | 42 |
| 77 | **Affiliate program** — creators earn commission on recommended products | API+Mobile | ~400 | 42 |
| 78 | **Revenue split 70/30** — give creators 70% (better than YouTube's 55%) | API | ~100 | 42 |
| 79 | **Instant payouts** — no 30-day wait, Stripe instant payout to creator bank | API | ~200 | 42 |
| 80 | **Creator contracts / brand deal marketplace** — connect creators with halal brands for sponsored content | API+Mobile | ~600 | 42 |
| 81 | **Branded content / Paid partnership label** — tag posts as sponsored, transparent disclosure | API+Mobile | ~200 | 42 |
| 82 | **Content licensing** — let creators license content for remix, automatic royalties | API+Mobile | ~400 | 42 |
| 83 | **Boost/Promote post** — paid reach at post level, budget selector, audience targeting | API+Mobile | ~500 | 42 |
| 84 | **Reminder posts** — "Remind me" button for upcoming events/drops, push notification at time | API+Mobile | ~300 | 42 |

**Tier 6 Total: 16 features, ~7,800 lines**

---

## TIER 7: ISLAMIC-FIRST MOAT — The Killer Differentiator (Launch Week)
*This is WHY users choose Mizanly over Instagram. No competitor can replicate this.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 85 | **Prayer-time-aware notifications** — auto-DND during salah, batch notifications between prayers, "Pray first" nudge | API+Mobile | ~500 | 43 |
| 86 | **Adhan integration** — beautiful adhan at prayer times, configurable per madhab/method | Mobile | ~400 | 43 |
| 87 | **Qibla compass** — direction finder using device magnetometer (prayer-times screen exists, add compass) | Mobile | ~300 | 43 |
| 88 | **Quran reading plans + Khatmah tracker** — set goal (30/60/90 days), track progress, share completion | API+Mobile | ~600 | 43 |
| 89 | **Tafsir integration** — tap any Quran verse for scholarly explanation, multiple tafsir sources | API+Mobile | ~500 | 43 |
| 90 | **Communal Quran reading rooms** — audio rooms with live text follow-along, turn-based recitation | API+Mobile | ~700 | 43 |
| 91 | **Sadaqah / Charity integration** — donate to verified charities from posts/profiles/stories, "Donate" button | API+Mobile | ~600 | 43 |
| 92 | **Hajj & Umrah companion** — planning checklists, dua at each location, group coordination, photo sharing | API+Mobile | ~800 | 43 |
| 93 | **Islamic scholar verification** — special badge with credentials, different from regular verified | API+Mobile | ~300 | 43 |
| 94 | **Halal content filter** — AI-powered, user-configurable strictness, auto-blur haram imagery, "family safe" tag | API+Mobile | ~600 | 43 |
| 95 | **Islamic date display** — Hijri date in headers everywhere, Islamic month theming (Ramadan, Dhul Hijjah) | Mobile | ~200 | 43 |
| 96 | **Eid/Islamic holiday cards & frames** — AR filters, story frames, post templates for Islamic occasions | Mobile | ~400 | 43 |
| 97 | **Nasheed mode** — replace all background music with nasheeds for users who avoid music | Mobile | ~300 | 43 |
| 98 | **Dhikr social** — share counter progress, group challenges ("1M salawat"), community counters | API+Mobile | ~500 | 43 |

**Tier 7 Total: 14 features, ~6,700 lines**

---

## TIER 8: PLATFORM & UX PARITY — Feature Completeness (Launch Week)
*Remaining competitor features needed for parity.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 99 | **Contact sync** — find friends from phone contacts, permission flow, suggestion list | API+Mobile | ~400 | 44 |
| 100 | **Share extension** — share from other apps into Mizanly (iOS share sheet, Android intent) | Mobile | ~500 | 44 |
| 101 | **Biometric app lock** — Face ID / fingerprint to open app | Mobile | ~300 | 44 |
| 102 | **Offline download** — save content for offline viewing, download manager | Mobile+API | ~600 | 44 |
| 103 | **PiP (Picture-in-Picture)** — video continues in floating window while browsing | Mobile | ~300 | 44 |
| 104 | **Mini player** — persistent bottom video player while navigating | Mobile | ~300 | 44 |
| 105 | **DM Notes** — Instagram-style short text status visible in DM list | API+Mobile | ~400 | 44 |
| 106 | **Restrict user** — soft-block: they can see but can't interact meaningfully | API+Mobile | ~300 | 44 |
| 107 | **Hide reply** — author hides comment without deleting, visible via "hidden replies" link | API+Mobile | ~200 | 44 |
| 108 | **Undo send** — brief 5-second cancel window after posting | Mobile | ~200 | 44 |
| 109 | **Muted conversations** — mute a specific thread/post notification | API+Mobile | ~200 | 44 |
| 110 | **Quiet mode** — pause all notifications + auto-reply "in quiet mode" in DMs | API+Mobile | ~300 | 44 |
| 111 | **Digital wellbeing / Screen time** — usage tracking, session limits, daily digest mode | Mobile | ~500 | 44 |
| 112 | **Cross-post between spaces** — share a Saf post as a Majlis thread, or a Bakra reel to Saf | Mobile+API | ~400 | 44 |
| 113 | **Video premiere** — scheduled video with live chat countdown | API+Mobile | ~500 | 44 |
| 114 | **Video clip sharing** — share a segment of a long video as a clip | Mobile+API | ~400 | 44 |
| 115 | **Ambient mode** — UI background color subtly matches video content | Mobile | ~200 | 44 |
| 116 | **End screens / cards** — clickable overlays at video end (subscribe, watch next) | Mobile+API | ~400 | 44 |
| 117 | **Collaborative playlists** — friends add to shared playlists | API+Mobile | ~300 | 44 |
| 118 | **Channel trailer** — different intro video for subscribers vs non-subscribers | API+Mobile | ~200 | 44 |
| 119 | **Auto-play settings** — WiFi only / always / never, data saver mode | Mobile | ~200 | 44 |
| 120 | **Clear mode** — hide all UI overlays while watching video, tap to show | Mobile | ~150 | 44 |
| 121 | **Comment swipe-to-like** gesture — swipe right on comment to like | Mobile | ~150 | 44 |
| 122 | **Home screen widgets** — iOS WidgetKit / Android AppWidget (prayer times, unread count) | Mobile | ~600 | 44 |
| 123 | **Parental controls** — restricted mode, content age gating, activity summary for parents | API+Mobile | ~500 | 44 |

**Tier 8 Total: 25 features, ~8,600 lines**

---

## TIER 9: AI-POWERED MOAT (Month One)
*AI features that create switching costs and delight.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 124 | **AI content assistant** — suggest captions, hashtags, best posting time, content ideas | API+Mobile | ~600 | 45 |
| 125 | **AI auto-translate posts** — real-time translation Arabic↔English↔Urdu↔Turkish↔Malay↔French↔Bangla | API+Mobile | ~500 | 45 |
| 126 | **AI content moderation** — trained on Islamic values + cultural context, not just Western norms | API | ~600 | 45 |
| 127 | **AI video captions** — auto-generate accurate captions in multiple languages (Whisper + translate) | API | ~400 | 45 |
| 128 | **AI avatar creation** — generate avatar/profile art from photo | API+Mobile | ~500 | 45 |
| 129 | **AI smart replies** — context-aware quick reply suggestions in DMs | API+Mobile | ~400 | 45 |
| 130 | **AI content summarization** — TLDR for long threads, video transcripts | API+Mobile | ~400 | 45 |
| 131 | **AI smart space routing** — suggest best space for content ("This looks like a thread, post to Majlis?") | Mobile | ~300 | 45 |

**Tier 9 Total: 8 features, ~3,700 lines**

---

## TIER 10: GAMIFICATION & RETENTION MOAT (Month One)
*Features that drive daily opens and long-term retention.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 132 | **Streaks** — posting streaks, engagement streaks, learning streaks (Quran, dhikr) | API+Mobile | ~500 | 46 |
| 133 | **Achievement badges** — "First Post," "100 Days," "Quran Khatmah," "Ramadan Warrior," "Community Helper" | API+Mobile | ~600 | 46 |
| 134 | **Levels & XP** — earn XP for positive contributions (helping, quality content, teaching) | API+Mobile | ~500 | 46 |
| 135 | **Leaderboards** — community leaderboards (top helpers, educators, dhikr leaders) | API+Mobile | ~400 | 46 |
| 136 | **Challenges** — community challenges ("30 days of Quran," "photograph your city") | API+Mobile | ~500 | 46 |
| 137 | **Progress bars** — visual progress on goals (posting consistency, learning, community milestones) | Mobile | ~200 | 46 |
| 138 | **Micro-drama / series format** — episodic content with follow for next episode, $7.8B market | API+Mobile | ~700 | 46 |
| 139 | **Interactive stories** — choose-your-own-adventure, branching narratives | API+Mobile | ~600 | 46 |
| 140 | **MySpace-style profile customization** — custom colors, layouts, music, widgets on profile | Mobile | ~600 | 46 |

**Tier 10 Total: 9 features, ~4,600 lines**

---

## TIER 11: SOCIAL COMMERCE & ISLAMIC FINANCE (Month One)
*Revenue infrastructure and halal commerce.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 141 | **Halal marketplace** — buy/sell halal products, Muslim-owned business tags | API+Mobile | ~800 | 47 |
| 142 | **Halal business directory + reviews** — find halal restaurants, services, community-rated | API+Mobile | ~600 | 47 |
| 143 | **Product tags in posts/reels** — tag products, one-tap purchase | API+Mobile | ~400 | 47 |
| 144 | **In-app checkout** — never leave app to buy, Stripe integration | API+Mobile | ~500 | 47 |
| 145 | **Interest-free installments** — Islamic finance compliant (no riba), split payments | API+Mobile | ~400 | 47 |
| 146 | **Zakat distribution** — connect zakat payers with verified recipients, transparent tracking | API+Mobile | ~500 | 47 |
| 147 | **Halal investment screening** — flag stocks/funds as halal/haram, community-verified | API+Mobile | ~400 | 47 |
| 148 | **Community treasury** — members pool funds for projects (mosque, school supplies, disaster relief) | API+Mobile | ~500 | 47 |
| 149 | **Premium tier** — ad-free + background play + downloads + exclusive features | API+Mobile | ~400 | 47 |

**Tier 11 Total: 9 features, ~4,500 lines**

---

## TIER 12: COMMUNITY, ANTI-TOXICITY & POLISH (Month One)
*Community features and safety polish.*

| # | Feature | Type | Est. Lines | Batch |
|---|---------|------|-----------|-------|
| 150 | **Cross-space content graph** — post in Saf, discuss in Majlis, share in Risalah, all linked | API+Mobile | ~600 | 48 |
| 151 | **Local community boards** — neighborhood/city level, mosque announcements, local events | API+Mobile | ~500 | 48 |
| 152 | **Mentorship matching** — connect new Muslims with experienced members, structured 1:1 | API+Mobile | ~500 | 48 |
| 153 | **Study circles (Halaqat)** — structured group learning, curriculum, progress tracking | API+Mobile | ~600 | 48 |
| 154 | **Fatwa Q&A routing** — ask question, route to verified scholar in your madhab/language | API+Mobile | ~500 | 48 |
| 155 | **Interfaith dialogue space** — respectful Q&A about Islam, moderated by scholars | API+Mobile | ~400 | 48 |
| 156 | **Volunteer coordination** — local opportunities, disaster relief, community service tracking | API+Mobile | ~400 | 48 |
| 157 | **Islamic event discovery** — Eid prayers, iftars, lectures, Quran competitions near you | API+Mobile | ~400 | 48 |
| 158 | **Ummah map** — visualize global Muslim community, see activity from your city/country | API+Mobile | ~500 | 48 |
| 159 | **Family account linking** — parent-child accounts, shared albums, transparent oversight | API+Mobile | ~600 | 48 |
| 160 | **Nikah networking** — optional marriage profile section, verified by family/community | API+Mobile | ~500 | 48 |
| 161 | **Kindness reminders** — "Would you like to rephrase?" before posting angry comments | Mobile | ~200 | 48 |
| 162 | **Anti-harassment shield** — detect pile-ons, auto-limit replies when viral negativity | API+Mobile | ~400 | 48 |
| 163 | **Reputation system** — positive contributors get more visibility | API+Mobile | ~400 | 48 |
| 164 | **Safe search for kids** — age-appropriate content filtering, no mature content in search | API+Mobile | ~300 | 48 |
| 165 | **Grief/crisis support** — detect distress, offer helpline resources, community support | API+Mobile | ~300 | 48 |
| 166 | **Comment quality scoring** — surface thoughtful comments, bury low-effort | API | ~300 | 48 |
| 167 | **Data portability** — export ALL data in standard formats, import from other platforms | API+Mobile | ~400 | 48 |
| 168 | **Content ownership declaration** — explicit "you own your content" policy, no AI training without consent | API | ~100 | 48 |
| 169 | **No vanity metrics mode** — option to hide like/follower counts | Mobile+API | ~200 | 48 |
| 170 | **LIVE battles** — split-screen creator vs creator | API+Mobile | ~600 | 48 |
| 171 | **Spatial audio rooms** — immersive audio with 3D sound positioning | Mobile | ~500 | 48 |
| 172 | **Watch parties** — synchronized video watching with friends + live chat | API+Mobile | ~600 | 48 |
| 173 | **Voice posts** — audio snippets in feed (voice tweets equivalent) | API+Mobile | ~400 | 48 |
| 174 | **Collaborative content** — co-author posts, co-create reels | API+Mobile | ~400 | 48 |
| 175 | **Trending effects/filter store** — community-created AR effects | API+Mobile | ~500 | 48 |
| 176 | **Multilingual Islamic content translation** — auto-translate between 8+ languages | API | ~400 | 48 |
| 177 | **Waqf model** — endowment-based funding, users contribute to permanent fund | API+Mobile | ~300 | 48 |
| 178 | **Collaborative saved collections** — shared bookmark folders | API+Mobile | ~300 | 48 |

**Tier 12 Total: 29 features, ~11,900 lines**

---

## TIER 13: TESTING & HARDENING (Runs in parallel with Tiers 5-12)

| # | Task | Type |
|---|------|------|
| T1 | **Unit tests for all 49+ backend modules** — aim for 80% coverage | API |
| T2 | **Integration tests** — API endpoint testing with real DB (test containers) | API |
| T3 | **E2E tests** — critical user flows (sign up → post → message → view) | Mobile |
| T4 | **Performance profiling** — FlatList virtualization, image caching, bundle size analysis | Mobile |
| T5 | **Security audit** — OWASP top 10, input sanitization, rate limiting, auth bypass checks | API |
| T6 | **CDN configuration** — Cloudflare edge caching for all media assets | DevOps |
| T7 | **App Store metadata** — screenshots, descriptions, keywords, review guidelines compliance | Mobile |
| T8 | **Play Store + Web domain** — listing, signing, web deployment | DevOps |
| T9 | **Load testing** — simulate 1000 concurrent users, find bottlenecks | API |
| T10 | **Accessibility audit** — screen reader support, font scaling, contrast ratios | Mobile |

---

## SUMMARY TABLE

| Tier | Theme | Features | Est. Lines | Priority |
|------|-------|----------|-----------|----------|
| **1** | Foundation | 13 | ~7,800 | **SHIP-BLOCKING** |
| **2** | Video/Media Creation | 13 | ~5,200 | **SHIP-BLOCKING** |
| **3** | Stories & Reels | 14 | ~7,500 | **SHIP-BLOCKING** |
| **4** | Chat (WhatsApp parity) | 20 | ~9,600 | **SHIP-BLOCKING** |
| **5** | Discovery & Feed | 12 | ~4,500 | Launch Week |
| **6** | Creator Economy | 16 | ~7,800 | Launch Week |
| **7** | Islamic-First Moat | 14 | ~6,700 | Launch Week |
| **8** | Platform/UX Parity | 25 | ~8,600 | Launch Week |
| **9** | AI Moat | 8 | ~3,700 | Month One |
| **10** | Gamification | 9 | ~4,600 | Month One |
| **11** | Commerce & Finance | 9 | ~4,500 | Month One |
| **12** | Community & Polish | 29 | ~11,900 | Month One |
| **13** | Testing & Hardening | 10 | parallel | Continuous |
| **TOTAL** | | **191 + 10** | **~82,400** | |

---

## EXECUTION STRATEGY

Each tier maps to 1-3 batch waves of parallel agents (10-30 agents per batch, as per existing workflow). Estimated 12 batch waves total (Batch 37-48).

**Batch 37:** Tier 1 (Foundation) — 13 agents
**Batch 38:** Tier 2 (Video/Media) — 13 agents
**Batch 39:** Tier 3 (Stories/Reels) — 14 agents
**Batch 40:** Tier 4 (Chat) — 20 agents (split into 40a + 40b if needed)
**Batch 41:** Tier 5 (Discovery) — 12 agents
**Batch 42:** Tier 6 (Creator Economy) — 16 agents
**Batch 43:** Tier 7 (Islamic Moat) — 14 agents
**Batch 44:** Tier 8 (Platform/UX) — 25 agents (split into 44a + 44b)
**Batch 45:** Tier 9 (AI) — 8 agents
**Batch 46:** Tier 10 (Gamification) — 9 agents
**Batch 47:** Tier 11 (Commerce) — 9 agents
**Batch 48:** Tier 12 (Community) — 29 agents (split into 48a + 48b + 48c)

Testing (Tier 13) runs in parallel throughout all batches.

---

## POST-BATCH CHECKLIST (After ALL tiers complete)

- [ ] Full regression test on iOS simulator
- [ ] Full regression test on Android emulator
- [ ] Full regression test on web (Chrome, Safari, Firefox)
- [ ] Performance benchmark (app launch <2s, feed scroll 60fps, video playback smooth)
- [ ] Security penetration test
- [ ] App Store submission (iOS)
- [ ] Play Store submission (Android)
- [ ] Web deployment (mizanly.app)
- [ ] Push notification testing (FCM + APNs)
- [ ] Stripe payment testing (live mode)
- [ ] Load test (1000 concurrent users)
- [ ] RTL/Arabic full walkthrough
- [ ] Accessibility audit pass
