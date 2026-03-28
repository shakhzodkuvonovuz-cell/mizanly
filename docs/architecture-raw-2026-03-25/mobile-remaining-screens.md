# Mobile Remaining Screens Catalog

> All screens in `apps/mobile/app/(screens)/` NOT covered by tabs, create-flow, detail/viewer, profile+settings, messaging, islamic+discovery, or editor agents.
>
> Total screen files: 176 (incl. `_layout.tsx`). This catalog covers **~120 remaining screens** organized by domain.

---

## 1. MONETIZATION & COMMERCE (12 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `creator-dashboard.tsx` | 1,054 | Creator hub with stats cards, revenue overview, content performance tabs | `creatorApi`, `commerceApi` |
| `analytics.tsx` | 611 | Account analytics — summary cards (views, likes, follows, shares), chart placeholders | `creatorApi`, `usersApi` |
| `post-insights.tsx` | 566 | Per-post engagement metrics (likes, comments, shares, saves) + discovery source breakdown | `creatorApi`, `postsApi` |
| `revenue.tsx` | 546 | Revenue overview (tips, memberships, gifts), transaction history list with filters | `api` (monetization) |
| `cashout.tsx` | 861 | Wallet balance (diamonds/USD), payment method management, cashout request form | `api` (wallet) |
| `gift-shop.tsx` | 774 | Coin purchase packages ($0.99-$49.99), gift catalog (TabSelector: gifts/history), gift sending with GIPHY | `giftsApi`, `paymentsApi` |
| `send-tip.tsx` | 692 | Tip a creator — preset amounts ($1-$50), custom input, platform fee display, message field | `monetizationApi`, `paymentsApi`, `usersApi` |
| `donate.tsx` | 610 | Donation flow with preset amounts, CharCountRing message, Stripe payment integration | `islamicApi`, `paymentsApi` |
| `waqf.tsx` | 294 | Islamic endowment fund list with contribute bottom sheet, preset amounts ($10-$500) | `api`, `paymentsApi` |
| `enable-tips.tsx` | 680 | Creator tip settings — enable/disable, custom tip amounts, welcome message, min amount | `monetizationApi`, `settingsApi` |
| `membership-tiers.tsx` | 739 | Creator membership tiers (bronze/silver/gold/platinum) with gradient cards, subscribe flow | `monetizationApi`, `usersApi` |
| `marketplace.tsx` | 509 | Halal product marketplace — 2-column grid, category filter (food/clothing/books/art/electronics/services) | `commerceApi` |

---

## 2. CREATOR TOOLS & PROMOTION (7 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `boost-post.tsx` | 460 | Post promotion — budget ($5-$50), duration (1-14 days), audience targeting, estimated reach | `promotionsApi` |
| `branded-content.tsx` | 330 | Paid partnership label toggle, partner name field, saves branded content settings | `promotionsApi` |
| `creator-storefront.tsx` | 460 | Creator's product storefront — grid display, halal certified badges, price/stock info | `api` (commerce) |
| `collab-requests.tsx` | 406 | Collaboration request management — pending/accepted tabs, accept/decline actions | `collabsApi` |
| `cross-post.tsx` | 400 | Cross-post content to other spaces (Saf/Majlis/Bakra/Minbar), preview + custom caption per space | `postsApi` |
| `product-detail.tsx` | 714 | Product page — image gallery, reviews, halal certification, add to cart, seller info | `commerceApi` |
| `orders.tsx` | 328 | Order history list — status badges (pending/paid/shipped/delivered/cancelled), product thumbnails | `commerceApi` |

---

## 3. SCHEDULING & PUBLISHING (3 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `schedule-post.tsx` | 942 | Calendar date picker + time selector (AM/PM), supports Saf/Majlis/Bakra spaces | `postsApi`, `threadsApi`, `reelsApi` |
| `schedule-live.tsx` | 500 | Schedule a live stream — date/time picker, thumbnail upload, title, 7-day date options | `liveApi`, `uploadApi` |
| `share-receive.tsx` | 579 | Receive shared content from other apps, preview + select target space for re-sharing | N/A (deep link handler) |

---

## 4. NOTIFICATIONS & MODERATION (5 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `notifications.tsx` | 613 | Notification center — SectionList grouped by date, follow-back button, 12+ notification types | `notificationsApi`, `followsApi` |
| `notification-tones.tsx` | 495 | Per-notification-type tone selector — 8 tone presets (gentle/soft/classic/adhan-inspired), audio preview | AsyncStorage (local) |
| `appeal-moderation.tsx` | 919 | Appeal a moderation action — 5 reason types, evidence upload, 3-step status tracker (submitted/review/decision) | `appealsApi` |
| `report.tsx` | 326 | Report content/user — 8 reason categories (spam, harassment, hate speech, etc.), details field + CharCountRing | `reportsApi` |
| `my-reports.tsx` | 248 | User's submitted reports list with status badges (pending/reviewed/resolved) | `reportsApi` |

---

## 5. CALLS & REAL-TIME (5 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `call/[id].tsx` | 652 | Active call screen — WebRTC (RTCView), voice/video toggle, mute, speaker, call timer, avatar pulse | `callsApi`, Socket.io, `useWebRTC` |
| `call-history.tsx` | 292 | Call log — missed/incoming/outgoing with duration, caller avatar, tap to call back | `callsApi` |
| `audio-room.tsx` | 939 | Clubhouse-style audio room — speaker grid with speaking indicators, raise hand, mute toggle | `audioRoomsApi` |
| `watch-party.tsx` | 386 | Synchronized video watching — create/join party, video search picker, real-time chat | `videosApi` |
| `live/[id].tsx` | 1,259 | Live stream viewer — video player, live chat, gift sending, viewer count, host controls | `liveApi` |

---

## 6. SECURITY & PRIVACY (8 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `2fa-setup.tsx` | 843 | TOTP 2FA setup — QR code display, authenticator app list, backup codes, screenshot prevention (ScreenCapture) | `twoFactorApi` |
| `2fa-verify.tsx` | 481 | 2FA verification — 6-digit code input with shake animation on error, backup code fallback mode | `twoFactorApi` |
| `verify-encryption.tsx` | 686 | E2E encryption verification — safety number display (QR code), fingerprint comparison, clipboard copy | `encryptionApi`, `encryptionService` |
| `biometric-lock.tsx` | 353 | Face ID / fingerprint lock toggle — hardware detection, enrollment check, LocalAuthentication API | Zustand store, `expo-local-authentication` |
| `parental-controls.tsx` | 859 | Parental PIN pad, linked child accounts, content restrictions, screen time limits | `parentalApi` |
| `link-child-account.tsx` | 386 | Link child account — search for user, PIN confirmation flow (4 steps: search/confirm/pin/confirmPin) | `searchApi`, `parentalApi` |
| `blocked-keywords.tsx` | 265 | Comment filter — add/remove blocked words, keyword list with delete button | `settingsApi` |
| `manage-data.tsx` | 458 | Data management — download data, delete account (destructive), cache clear, storage info | `usersApi`, `accountApi`, Clerk |

---

## 7. WELLBEING & DIGITAL HEALTH (3 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `screen-time.tsx` | 600 | Usage analytics — daily bar chart, session count, configurable time limits (15min-8hr), limit selector | `settingsApi`, AsyncStorage |
| `quiet-mode.tsx` | 523 | Do-not-disturb schedule — start/end time pickers, custom message, auto-reply toggle | `settingsApi` |
| `wind-down.tsx` | 224 | Breathing exercise — animated circle (4s inhale/4s exhale), back button blocks Android back, calming gradient | N/A (local animation) |

---

## 8. SOCIAL GRAPHS & FOLLOW MANAGEMENT (6 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `followers/[userId].tsx` | 216 | Follower list — infinite scroll, follow-back button, verified badges | `followsApi` |
| `following/[userId].tsx` | 216 | Following list — infinite scroll, unfollow button, verified badges | `followsApi` |
| `mutual-followers.tsx` | 311 | Mutual followers between two users — follow toggle, verified badges | `usersApi`, `followsApi` |
| `follow-requests.tsx` | 229 | Pending follow request inbox — accept/decline per request | `followsApi` |
| `blocked.tsx` | 214 | Blocked users list with unblock button | `blocksApi` |
| `muted.tsx` | 210 | Muted users list with unmute button | `mutesApi` |
| `restricted.tsx` | 257 | Restricted users list with unrestrict button | `restrictsApi` |

---

## 9. COMMUNITY & GROUPS (8 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `communities.tsx` | 632 | Community discovery — category filter (Islamic/Tech/Sports/etc.), join/leave, TabSelector, spring animations | `communitiesApi` |
| `community-posts.tsx` | 662 | Community feed — channel posts with like/reply, image upload, rich text, post creation inline | `channelPostsApi`, `uploadApi` |
| `circles.tsx` | 366 | Friend circles management — create circle with emoji picker (10 Islamic emojis), member count | `circlesApi` |
| `close-friends.tsx` | 493 | Close friends list — search followers, toggle on/off per user, auto-creates "Close Friends" circle | `followsApi`, `circlesApi` |
| `majlis-lists.tsx` | 383 | Majlis (Twitter-style) curated lists — create public/private lists, manage members | `majlisListsApi` |
| `broadcast-channels.tsx` | 458 | Broadcast channel discovery — discover/my tabs, subscribe/mute toggle, create channel | `broadcastApi` |
| `manage-broadcast.tsx` | 280 | Broadcast channel admin — subscribers/admins tabs, member management | `broadcastApi`, `followsApi` |
| `local-boards.tsx` | 157 | Location-based community boards — search + infinite scroll, debounced search | `api` (local boards) |

---

## 10. GAMIFICATION (5 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `streaks.tsx` | 509 | Streak tracker — posting/prayer/dhikr/learning streaks, calendar heatmap, current vs longest | `gamificationApi` |
| `achievements.tsx` | 469 | Achievement gallery — category filter (content/social/islamic/milestone/special), rarity tiers (common→legendary) | `gamificationApi` |
| `leaderboard.tsx` | 477 | Global leaderboard — 3 tabs (XP/streaks/helpers), top-3 podium with gold/silver/bronze, avatar + rank | `gamificationApi` |
| `xp-history.tsx` | 423 | XP event log — level progress bar, XP events with reasons and timestamps | `gamificationApi` |
| `challenges.tsx` | 656 | Platform challenges — discover/my tabs, join challenge, progress tracking, cover images | `gamificationApi` |

---

## 11. CONTENT MANAGEMENT (7 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `saved.tsx` | 549 | Saved content — 4 tabs (posts/threads/reels/videos), 3-column grid for media, ThreadCard for threads | `usersApi` |
| `archive.tsx` | 288 | Story archive — 3-column grid of expired stories, long-press to delete, BottomSheet actions | `storiesApi` |
| `drafts.tsx` | 214 | Draft content list — space icons (Saf/Majlis/Bakra/Minbar), resume editing, delete with Alert | `draftsApi` |
| `downloads.tsx` | 584 | Offline downloads — storage bar, filter tabs (all/downloading/complete), file size display | `downloadsApi` |
| `watch-history.tsx` | 331 | Video watch history — thumbnail + progress bar, channel info, clear history | `usersApi` |
| `bookmark-folders.tsx` | 320 | Bookmark folder management — 2-column grid, create/rename/delete folders, item count | `bookmarksApi` |
| `bookmark-collections.tsx` | 241 | Bookmark collections — grid display with cover images, progressive loading | `bookmarksApi` |

---

## 12. PROFILE & ACCOUNT (5 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `profile-customization.tsx` | 698 | Profile customization — accent color, layout style, bio font, badge/level/streak visibility, background image | `gamificationApi`, `uploadApi` |
| `account-switcher.tsx` | 810 | Multi-account manager — switch active Clerk session, account list with follower counts, add new account | `usersApi`, Clerk |
| `share-profile.tsx` | 423 | Share profile — QR code (react-native-qrcode-svg), copy link, native Share sheet | `usersApi` |
| `flipside.tsx` | 622 | Alt/anonymous profile (BeReal-style) — create alt identity, manage access list, alt profile feed | `altProfileApi` |
| `contact-sync.tsx` | 345 | Find contacts on Mizanly — expo-contacts hash upload, matched user list, follow button | `usersApi`, `followsApi` |

---

## 13. MEDIA & AUDIO (6 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `camera.tsx` | 532 | In-app camera — photo/video/story modes, flash toggle, front/back switch, recording timer | `expo-camera` |
| `voice-recorder.tsx` | 358 | Voice message recorder — record/stop/play/re-record, waveform levels, 5-min limit, upload on confirm | `uploadApi`, `expo-av` |
| `audio-library.tsx` | 682 | Audio track browser — category tabs (Trending/Islamic/Nasheeds/Lo-fi/etc.), search, preview playback | `audioTracksApi` |
| `trending-audio.tsx` | 327 | Trending audio tracks — list with play preview, use count, cover art, navigate to sound page | `audioTracksApi` |
| `sticker-browser.tsx` | 494 | Sticker pack browser — search, infinite scroll, collect/remove packs, waterfall grid | `stickersApi` |
| `save-to-playlist.tsx` | 343 | Add video to playlist — channel playlists list, check/uncheck per playlist, create new | `channelsApi`, `playlistsApi` |

---

## 14. VIDEO FEATURES (3 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `reel-templates.tsx` | 522 | Reel template gallery — trending/recent/mine tabs, 2-column masonry, template duration, use count | `reelTemplatesApi` |
| `video-premiere.tsx` | 246 | Schedule video premiere — date/time input, live chat toggle, theme selector (emerald/gold/cosmic) | `videosApi` |
| `series-discover.tsx` | 486 | Series discovery — category filter (drama/documentary/tutorial/comedy/islamic), subscribe, episode count | `gamificationApi` |

---

## 15. AI FEATURES (2 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `ai-assistant.tsx` | 381 | AI content helper — 3 tabs (captions/hashtags/ideas), 4 tone options (casual/professional/funny/inspirational), clipboard copy | `aiApi` |
| `ai-avatar.tsx` | 275 | AI avatar generator — 4 style presets (default/anime/watercolor/islamic_art), generate + set as profile | `aiApi`, `usersApi` |

---

## 16. ISLAMIC SOCIAL (6 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `charity-campaign.tsx` | 274 | Charity campaign detail — progress bar, donation goal, share button, campaign description | `islamicApi` |
| `eid-cards.tsx` | 228 | Islamic greeting card creator — 6 occasions (Eid Fitr/Adha, Ramadan, Mawlid, Isra-Miraj, Hijri NY), share via native | `EidFrame` component |
| `volunteer-board.tsx` | 505 | Volunteer opportunity board — 5 categories (disaster relief/mosque/education/food bank/cleanup), sign up | `volunteerApi` |
| `scholar-verification.tsx` | 649 | Scholar verification application — specialization (fiqh/hadith/tafsir/aqeedah), madhab selection, credentials upload | `islamicApi` |
| `mentorship.tsx` | 241 | Mentorship matching — 5 topics (new Muslim/Quran/Arabic/fiqh/general), find/my tabs, request mentoring | `api`, `searchApi` |
| `nasheed-mode.tsx` | 239 | Nasheed-only mode toggle — replaces all music with Islamic nasheeds, sample playlist display | `usersApi` (nasheedMode) |

---

## 17. CONTENT DISCOVERY & FEED (3 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `followed-topics.tsx` | 476 | Followed hashtags manager — search to follow new topics, unfollow toggle, post count per tag | `hashtagsApi` |
| `why-showing.tsx` | 368 | Explanation for why a post appeared in feed — reason cards (follow, trending, interest, location) | `feedApi`, `postsApi` |
| `morning-briefing.tsx` | 763 | Daily Islamic briefing — hijri date, prayer times, hadith/ayah/dua of the day, dhikr challenge, audio playback | `islamicApi`, `expo-location`, `expo-av` |

---

## 18. QR & SHARING (2 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `qr-code.tsx` | 215 | QR code display for profile URL (`mizanly.app/@username`), share button, copy link | `react-native-qrcode-svg` |
| `qr-scanner.tsx` | 227 | Camera-based QR scanner — barcode scanning via expo-camera, auto-navigate to scanned mizanly.app URL | `expo-camera` |

---

## 19. SPECIAL FEATURES (3 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `disposable-camera.tsx` | 589 | Time-limited camera (BeReal-style) — 2-min countdown, front+back capture, mini cam preview, one-shot upload | `storiesApi`, `uploadApi`, `expo-camera` |
| `storage-management.tsx` | 560 | Device storage analyzer — categorized usage (images/videos/voice/documents/cache), clear by category | `expo-file-system` |
| `location-picker.tsx` | 488 | GPS location picker — expo-location geocode/reverse, search by name, manual lat/lng input | `expo-location` |

---

## 20. STATUS & ERROR SCREENS (2 screens)

| Screen | Lines | Description | Key API Services |
|--------|-------|-------------|-----------------|
| `maintenance.tsx` | 127 | Server maintenance screen — retry button pings health endpoint, auto-navigates home when server returns | Health endpoint fetch |
| `banned.tsx` | 94 | Account banned screen — appeal button links to appeal-moderation, sign-out option | Clerk `signOut` |

---

## SUMMARY BY SIZE

| Size Bracket | Count | Examples |
|-------------|-------|---------|
| 800+ lines | 8 | creator-dashboard (1054), schedule-post (942), audio-room (939), appeal-moderation (919) |
| 500-799 lines | 24 | gift-shop (774), morning-briefing (763), membership-tiers (739), cashout (861) |
| 300-499 lines | 40 | majlis-lists (383), ai-assistant (381), circles (366), voice-recorder (358) |
| 100-299 lines | 23 | bookmark-collections (241), nasheed-mode (239), follow-requests (229), banned (94) |

**Total remaining screens documented: 95**
**Total lines across remaining screens: ~46,200**

---

## API SERVICE DISTRIBUTION

| Service | Screen Count | Notes |
|---------|-------------|-------|
| `gamificationApi` | 7 | Streaks, achievements, leaderboard, XP, challenges, series-discover, profile-customization |
| `followsApi` | 6 | Followers, following, mutual, requests, close-friends, contact-sync |
| `commerceApi` | 4 | Marketplace, product-detail, orders, creator-storefront |
| `paymentsApi` | 4 | Gift-shop, send-tip, donate, waqf |
| `islamicApi` | 4 | Donate, charity-campaign, scholar-verification, morning-briefing |
| `settingsApi` | 4 | Blocked-keywords, screen-time, quiet-mode, enable-tips |
| `monetizationApi` | 3 | Send-tip, enable-tips, membership-tiers |
| `broadcastApi` | 3 | Broadcast-channels, manage-broadcast, create-broadcast |
| `creatorApi` | 2 | Creator-dashboard, analytics |
| `audioTracksApi` | 2 | Audio-library, trending-audio |
| `bookmarksApi` | 2 | Bookmark-folders, bookmark-collections |
| `callsApi` | 2 | Call screen, call-history |
| `aiApi` | 2 | AI-assistant, AI-avatar |
| `reportsApi` | 2 | Report, my-reports |
| Clerk SDK | 3 | Account-switcher, banned, manage-data |
| AsyncStorage | 2 | Notification-tones, screen-time |
| Socket.io | 1 | Call screen (WebRTC signaling) |
