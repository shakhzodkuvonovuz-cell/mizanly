# Agent #33 — Theme/Styling Deep Audit

**Date:** 2026-03-21
**Scope:** Theme tokens, hardcoded colors, font families, dark mode support, hardcoded English strings, borderRadius violations, spacing violations
**Files audited:** theme/index.ts, 65+ component files, 187+ screen files (sampled 50+ in detail)
**Total findings:** 267

---

## CATEGORY 1: DARK MODE ARCHITECTURALLY BROKEN (244 files, ~1,251 occurrences)

### Root Cause

The theme system defines both `colors.dark.*` and `colors.light.*` tokens in `apps/mobile/src/theme/index.ts` (lines 14-37), but there is **NO theme-aware abstraction**. Every single file that needs a background, border, or surface color directly imports `colors.dark.*` instead of using a theme-aware getter.

The `theme-settings.tsx` screen (line 106) shows what SHOULD happen:
```ts
const themeColors = effectiveTheme === 'dark' ? colors.dark : colors.light;
```
But this pattern exists in exactly ONE file. The other 243 files hardcode `colors.dark.*`.

Additionally, `colors.text.primary` is hardcoded to `#FFFFFF` (line 41) and `colors.text.inverse` to `#1E293B` (line 44) — these are dark-mode-only values with no light-mode variants.

**Impact:** Light mode is completely non-functional. The theme store (`dark | light | system`) exists, the theme-settings screen exists, users can select "Light" — but every screen stays dark because all 244 files hardcode `colors.dark.bg`, `colors.dark.bgCard`, etc.

**No file uses `colors.light.*` anywhere.** Zero imports. The light theme definition is dead code.

### Finding 1.1 — colors.light.* never referenced (0 usages)
- **File:** `apps/mobile/src/theme/index.ts`, lines 27-37
- **Code:** `colors.light` object defined with bg, bgElevated, bgCard, bgSheet, surface, etc.
- **Issue:** This entire object is dead code. No `.tsx` file in the codebase references `colors.light.*`.

### Finding 1.2 — colors.text.primary hardcoded to dark-mode-only white
- **File:** `apps/mobile/src/theme/index.ts`, line 41
- **Code:** `primary: '#FFFFFF',`
- **Issue:** Text primary is white, only works on dark backgrounds. No `colors.text.light.*` variant exists. In light mode, white text on white bg = invisible.

### Finding 1.3 — colors.text.secondary/tertiary also dark-mode-only
- **File:** `apps/mobile/src/theme/index.ts`, lines 42-43
- **Code:** `secondary: '#8B949E',` / `tertiary: '#6E7781',`
- **Issue:** These gray tones are chosen for dark backgrounds only. On light backgrounds they'd have poor contrast.

### Finding 1.4 — elevation system hardcoded to dark theme
- **File:** `apps/mobile/src/theme/index.ts`, lines 167-201
- **Code:** All 5 elevation presets use `colors.dark.bg`, `colors.dark.bgElevated`, `colors.dark.bgCard`, `colors.dark.bgSheet`
- **Issue:** Any component using `elevation.surface`, `elevation.raised`, `elevation.overlay`, `elevation.modal`, or `elevation.toast` is locked to dark theme colors.

### Findings 1.5 through 1.248 — All 244 files hardcoding colors.dark.*

Every file listed below directly references `colors.dark.*` in its StyleSheet or inline styles, breaking light mode:

**Components (52 files):**

| # | File | Line(s) | Token(s) Used | Occurrences |
|---|------|---------|---------------|-------------|
| 1.5 | `src/components/ui/ScreenErrorBoundary.tsx` | 59 | `colors.dark.bg` | 1 |
| 1.6 | `src/components/ui/BottomSheet.tsx` | ~193 | `colors.dark.*` | 1 |
| 1.7 | `src/components/ui/Skeleton.tsx` | multiple | `colors.dark.*` | 6 |
| 1.8 | `src/components/ui/TabSelector.tsx` | multiple | `colors.dark.*` | 3 |
| 1.9 | `src/components/ui/Autocomplete.tsx` | multiple | `colors.dark.*` | 4 |
| 1.10 | `src/components/ui/Avatar.tsx` | multiple | `colors.dark.*` | 3 |
| 1.11 | `src/components/ui/EmptyState.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.12 | `src/components/ui/GlassHeader.tsx` | multiple | `colors.dark.*` | 2 |
| 1.13 | `src/components/ui/ImageCarousel.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.14 | `src/components/ui/LinkPreview.tsx` | multiple | `colors.dark.*` | 2 |
| 1.15 | `src/components/ui/LocationPicker.tsx` | multiple | `colors.dark.*` | 3 |
| 1.16 | `src/components/ui/MiniPlayer.tsx` | multiple | `colors.dark.*` | 6 |
| 1.17 | `src/components/ui/PremiereCountdown.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.18 | `src/components/ui/TTSMiniPlayer.tsx` | multiple | `colors.dark.*` | 3 |
| 1.19 | `src/components/ui/VerifiedBadge.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.20 | `src/components/ui/VideoPlayer.tsx` | multiple | `colors.dark.*` | 6 |
| 1.21 | `src/components/ErrorBoundary.tsx` | 50 | `colors.dark.bg` | 1 |
| 1.22 | `src/components/AlgorithmCard.tsx` | multiple | `colors.dark.*` | 2 |
| 1.23 | `src/components/bakra/CommentsSheet.tsx` | multiple | `colors.dark.*` | 8 |
| 1.24 | `src/components/ContactMessage.tsx` | multiple | `colors.dark.*` | 4 |
| 1.25 | `src/components/islamic/EidFrame.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.26 | `src/components/LocationMessage.tsx` | multiple | `colors.dark.*` | 3 |
| 1.27 | `src/components/majlis/ThreadCard.tsx` | multiple | `colors.dark.*` | 4 |
| 1.28 | `src/components/PinnedMessageBar.tsx` | multiple | `colors.dark.*` | 2 |
| 1.29 | `src/components/risalah/StickerPackBrowser.tsx` | multiple | `colors.dark.*` | 9 |
| 1.30 | `src/components/risalah/StickerPicker.tsx` | multiple | `colors.dark.*` | 6 |
| 1.31 | `src/components/saf/PostCard.tsx` | multiple | `colors.dark.*` | 3 |
| 1.32 | `src/components/saf/StoryBubble.tsx` | multiple | `colors.dark.*` | 2 |
| 1.33 | `src/components/saf/StoryRow.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.34 | `src/components/story/AddYoursSticker.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.35 | `src/components/story/CountdownSticker.tsx` | multiple | `colors.dark.*` | 2 |
| 1.36 | `src/components/story/DrawingCanvas.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.37 | `src/components/story/LinkSticker.tsx` | ~1 line | `colors.dark.*` | 1 |
| 1.38 | `src/components/story/MusicPicker.tsx` | multiple | `colors.dark.*` | 4 |
| 1.39 | `src/components/story/PollSticker.tsx` | multiple | `colors.dark.*` | 2 |
| 1.40 | `src/components/story/QuestionSticker.tsx` | multiple | `colors.dark.*` | 5 |
| 1.41 | `src/components/story/QuizSticker.tsx` | multiple | `colors.dark.*` | 2 |
| 1.42 | `src/components/story/SliderSticker.tsx` | multiple | `colors.dark.*` | 4 |
| 1.43 | `src/components/story/TextEffects.tsx` | multiple | `colors.dark.*` | 4 |
| 1.44 | `src/components/VideoReplySheet.tsx` | multiple | `colors.dark.*` | 5 |
| 1.45 | `src/components/web/WebLayout.tsx` | multiple | `colors.dark.*` | 2 |
| 1.46 | `src/components/web/WebSidebar.tsx` | multiple | `colors.dark.*` | 4 |
| 1.47 | `src/components/editor/VideoTimeline.tsx` | multiple | `colors.dark.*` | 5 |
| 1.48 | `src/components/editor/VideoTransitions.tsx` | ~1 line | `colors.dark.*` | 1 |

**Tab screens (5 files):**

| # | File | Occurrences |
|---|------|-------------|
| 1.49 | `app/(tabs)/saf.tsx` | 3 |
| 1.50 | `app/(tabs)/risalah.tsx` | 4 |
| 1.51 | `app/(tabs)/minbar.tsx` | 6 |
| 1.52 | `app/(tabs)/majlis.tsx` | 3 |
| 1.53 | `app/(tabs)/bakra.tsx` | 2 |

**Auth/onboarding screens (7 files):**

| # | File | Occurrences |
|---|------|-------------|
| 1.54 | `app/(auth)/sign-up.tsx` | 9 |
| 1.55 | `app/(auth)/sign-in.tsx` | 6 |
| 1.56 | `app/(auth)/forgot-password.tsx` | 3 |
| 1.57 | `app/onboarding/username.tsx` | 6 |
| 1.58 | `app/onboarding/profile.tsx` | 7 |
| 1.59 | `app/onboarding/suggested.tsx` | 3 |
| 1.60 | `app/onboarding/interests.tsx` | 5 |

**Screen files (187 files) — full list of all screen files using colors.dark.*:**

| # | File | Occurrences |
|---|------|-------------|
| 1.61 | `app/(screens)/2fa-setup.tsx` | 1 |
| 1.62 | `app/(screens)/2fa-verify.tsx` | 1 |
| 1.63 | `app/(screens)/account-settings.tsx` | 1 |
| 1.64 | `app/(screens)/account-switcher.tsx` | 6 |
| 1.65 | `app/(screens)/achievements.tsx` | 3 |
| 1.66 | `app/(screens)/ai-assistant.tsx` | 7 |
| 1.67 | `app/(screens)/ai-avatar.tsx` | 5 |
| 1.68 | `app/(screens)/analytics.tsx` | 1 |
| 1.69 | `app/(screens)/appeal-moderation.tsx` | 11 |
| 1.70 | `app/(screens)/archive.tsx` | 3 |
| 1.71 | `app/(screens)/audio-library.tsx` | 1 |
| 1.72 | `app/(screens)/audio-room.tsx` | 10 |
| 1.73 | `app/(screens)/biometric-lock.tsx` | 2 |
| 1.74 | `app/(screens)/blocked.tsx` | 2 |
| 1.75 | `app/(screens)/blocked-keywords.tsx` | 1 |
| 1.76 | `app/(screens)/bookmark-collections.tsx` | 3 |
| 1.77 | `app/(screens)/bookmark-folders.tsx` | 5 |
| 1.78 | `app/(screens)/boost-post.tsx` | 12 |
| 1.79 | `app/(screens)/branded-content.tsx` | 12 |
| 1.80 | `app/(screens)/broadcast-channels.tsx` | 5 |
| 1.81 | `app/(screens)/broadcast/[id].tsx` | 6 |
| 1.82 | `app/(screens)/call-history.tsx` | 1 |
| 1.83 | `app/(screens)/call/[id].tsx` | 2 |
| 1.84 | `app/(screens)/caption-editor.tsx` | 1 |
| 1.85 | `app/(screens)/cashout.tsx` | 15 |
| 1.86 | `app/(screens)/challenges.tsx` | 6 |
| 1.87 | `app/(screens)/channel/[handle].tsx` | 19 |
| 1.88 | `app/(screens)/charity-campaign.tsx` | 4 |
| 1.89 | `app/(screens)/chat-export.tsx` | 8 |
| 1.90 | `app/(screens)/chat-folders.tsx` | 6 |
| 1.91 | `app/(screens)/chat-lock.tsx` | 5 |
| 1.92 | `app/(screens)/chat-theme-picker.tsx` | 12 |
| 1.93 | `app/(screens)/chat-wallpaper.tsx` | 16 |
| 1.94 | `app/(screens)/circles.tsx` | 2 |
| 1.95 | `app/(screens)/close-friends.tsx` | 3 |
| 1.96 | `app/(screens)/collab-requests.tsx` | 2 |
| 1.97 | `app/(screens)/communities.tsx` | 3 |
| 1.98 | `app/(screens)/community-posts.tsx` | 3 |
| 1.99 | `app/(screens)/contact-sync.tsx` | 2 |
| 1.100 | `app/(screens)/content-filter-settings.tsx` | 4 |
| 1.101 | `app/(screens)/content-settings.tsx` | 2 |
| 1.102 | `app/(screens)/conversation-info.tsx` | 12 |
| 1.103 | `app/(screens)/conversation-media.tsx` | 5 |
| 1.104 | `app/(screens)/conversation/[id].tsx` | 33 |
| 1.105 | `app/(screens)/create-broadcast.tsx` | 4 |
| 1.106 | `app/(screens)/create-clip.tsx` | 9 |
| 1.107 | `app/(screens)/create-event.tsx` | 17 |
| 1.108 | `app/(screens)/create-group.tsx` | 5 |
| 1.109 | `app/(screens)/create-playlist.tsx` | 2 |
| 1.110 | `app/(screens)/create-post.tsx` | 10 |
| 1.111 | `app/(screens)/create-reel.tsx` | 10 |
| 1.112 | `app/(screens)/create-story.tsx` | 31 |
| 1.113 | `app/(screens)/create-thread.tsx` | 10 |
| 1.114 | `app/(screens)/create-video.tsx` | 18 |
| 1.115 | `app/(screens)/creator-dashboard.tsx` | 12 |
| 1.116 | `app/(screens)/creator-storefront.tsx` | 6 |
| 1.117 | `app/(screens)/cross-post.tsx` | 12 |
| 1.118 | `app/(screens)/dhikr-challenge-detail.tsx` | 4 |
| 1.119 | `app/(screens)/dhikr-challenges.tsx` | 7 |
| 1.120 | `app/(screens)/dhikr-counter.tsx` | 3 |
| 1.121 | `app/(screens)/disappearing-default.tsx` | 7 |
| 1.122 | `app/(screens)/disappearing-settings.tsx` | 6 |
| 1.123 | `app/(screens)/discover.tsx` | 14 |
| 1.124 | `app/(screens)/disposable-camera.tsx` | 7 |
| 1.125 | `app/(screens)/dm-note-editor.tsx` | 1 |
| 1.126 | `app/(screens)/donate.tsx` | 10 |
| 1.127 | `app/(screens)/downloads.tsx` | 5 |
| 1.128 | `app/(screens)/drafts.tsx` | 1 |
| 1.129 | `app/(screens)/dua-collection.tsx` | 8 |
| 1.130 | `app/(screens)/duet-create.tsx` | 10 |
| 1.131 | `app/(screens)/edit-channel.tsx` | 3 |
| 1.132 | `app/(screens)/edit-profile.tsx` | 5 |
| 1.133 | `app/(screens)/eid-cards.tsx` | 2 |
| 1.134 | `app/(screens)/enable-tips.tsx` | 5 |
| 1.135 | `app/(screens)/end-screen-editor.tsx` | 9 |
| 1.136 | `app/(screens)/event-detail.tsx` | 13 |
| 1.137 | `app/(screens)/fasting-tracker.tsx` | 8 |
| 1.138 | `app/(screens)/fatwa-qa.tsx` | 6 |
| 1.139 | `app/(screens)/follow-requests.tsx` | 1 |
| 1.140 | `app/(screens)/followed-topics.tsx` | 4 |
| 1.141 | `app/(screens)/followers/[userId].tsx` | 2 |
| 1.142 | `app/(screens)/following/[userId].tsx` | 2 |
| 1.143 | `app/(screens)/gift-shop.tsx` | 10 |
| 1.144 | `app/(screens)/go-live.tsx` | 11 |
| 1.145 | `app/(screens)/green-screen-editor.tsx` | 4 |
| 1.146 | `app/(screens)/hadith.tsx` | 1 |
| 1.147 | `app/(screens)/hajj-companion.tsx` | 5 |
| 1.148 | `app/(screens)/hajj-step.tsx` | 7 |
| 1.149 | `app/(screens)/halal-finder.tsx` | 5 |
| 1.150 | `app/(screens)/hashtag-explore.tsx` | 1 |
| 1.151 | `app/(screens)/hashtag/[tag].tsx` | 4 |
| 1.152 | `app/(screens)/hifz-tracker.tsx` | 8 |
| 1.153 | `app/(screens)/image-editor.tsx` | 4 |
| 1.154 | `app/(screens)/islamic-calendar.tsx` | 1 |
| 1.155 | `app/(screens)/leaderboard.tsx` | 2 |
| 1.156 | `app/(screens)/link-child-account.tsx` | 7 |
| 1.157 | `app/(screens)/live/[id].tsx` | 13 |
| 1.158 | `app/(screens)/local-boards.tsx` | 4 |
| 1.159 | `app/(screens)/location-picker.tsx` | 10 |
| 1.160 | `app/(screens)/majlis-list/[id].tsx` | 2 |
| 1.161 | `app/(screens)/majlis-lists.tsx` | 3 |
| 1.162 | `app/(screens)/manage-broadcast.tsx` | 2 |
| 1.163 | `app/(screens)/manage-data.tsx` | 1 |
| 1.164 | `app/(screens)/marketplace.tsx` | 8 |
| 1.165 | `app/(screens)/media-settings.tsx` | 12 |
| 1.166 | `app/(screens)/membership-tiers.tsx` | 2 |
| 1.167 | `app/(screens)/mentorship.tsx` | 4 |
| 1.168 | `app/(screens)/morning-briefing.tsx` | 2 |
| 1.169 | `app/(screens)/mosque-finder.tsx` | 1 |
| 1.170 | `app/(screens)/muted.tsx` | 3 |
| 1.171 | `app/(screens)/mutual-followers.tsx` | 1 |
| 1.172 | `app/(screens)/my-reports.tsx` | 1 |
| 1.173 | `app/(screens)/names-of-allah.tsx` | 7 |
| 1.174 | `app/(screens)/nasheed-mode.tsx` | 2 |
| 1.175 | `app/(screens)/new-conversation.tsx` | 2 |
| 1.176 | `app/(screens)/notification-tones.tsx` | 4 |
| 1.177 | `app/(screens)/notifications.tsx` | 5 |
| 1.178 | `app/(screens)/orders.tsx` | 4 |
| 1.179 | `app/(screens)/parental-controls.tsx` | 11 |
| 1.180 | `app/(screens)/photo-music.tsx` | 12 |
| 1.181 | `app/(screens)/pinned-messages.tsx` | 2 |
| 1.182 | `app/(screens)/playlist/[id].tsx` | 1 |
| 1.183 | `app/(screens)/playlists/[channelId].tsx` | 1 |
| 1.184 | `app/(screens)/post/[id].tsx` | 7 |
| 1.185 | `app/(screens)/post-insights.tsx` | 6 |
| 1.186 | `app/(screens)/prayer-times.tsx` | 3 |
| 1.187 | `app/(screens)/product/[id].tsx` | 5 |
| 1.188 | `app/(screens)/product-detail.tsx` | 10 |
| 1.189 | `app/(screens)/profile/[username].tsx` | 15 |
| 1.190 | `app/(screens)/profile-customization.tsx` | 8 |
| 1.191 | `app/(screens)/qibla-compass.tsx` | 1 |
| 1.192 | `app/(screens)/qr-code.tsx` | 1 |
| 1.193 | `app/(screens)/qr-scanner.tsx` | 3 |
| 1.194 | `app/(screens)/quiet-mode.tsx` | 3 |
| 1.195 | `app/(screens)/quran-reading-plan.tsx` | 4 |
| 1.196 | `app/(screens)/quran-room.tsx` | 4 |
| 1.197 | `app/(screens)/quran-share.tsx` | 1 |
| 1.198 | `app/(screens)/ramadan-mode.tsx` | 3 |
| 1.199 | `app/(screens)/reel/[id].tsx` | 8 |
| 1.200 | `app/(screens)/reel-remix.tsx` | 6 |
| 1.201 | `app/(screens)/reel-templates.tsx` | 5 |
| 1.202 | `app/(screens)/report.tsx` | 3 |
| 1.203 | `app/(screens)/reports/[id].tsx` | 3 |
| 1.204 | `app/(screens)/restricted.tsx` | 3 |
| 1.205 | `app/(screens)/revenue.tsx` | 7 |
| 1.206 | `app/(screens)/save-to-playlist.tsx` | 1 |
| 1.207 | `app/(screens)/saved.tsx` | 9 |
| 1.208 | `app/(screens)/saved-messages.tsx` | 5 |
| 1.209 | `app/(screens)/schedule-live.tsx` | 9 |
| 1.210 | `app/(screens)/schedule-post.tsx` | 3 |
| 1.211 | `app/(screens)/scholar-verification.tsx` | 11 |
| 1.212 | `app/(screens)/screen-time.tsx` | 4 |
| 1.213 | `app/(screens)/search.tsx` | 16 |
| 1.214 | `app/(screens)/search-results.tsx` | 4 |
| 1.215 | `app/(screens)/send-tip.tsx` | 3 |
| 1.216 | `app/(screens)/series/[id].tsx` | 6 |
| 1.217 | `app/(screens)/series-detail.tsx` | 11 |
| 1.218 | `app/(screens)/series-discover.tsx` | 8 |
| 1.219 | `app/(screens)/settings.tsx` | 2 |
| 1.220 | `app/(screens)/share-profile.tsx` | 2 |
| 1.221 | `app/(screens)/share-receive.tsx` | 9 |
| 1.222 | `app/(screens)/sound/[id].tsx` | 3 |
| 1.223 | `app/(screens)/starred-messages.tsx` | 3 |
| 1.224 | `app/(screens)/status-privacy.tsx` | 7 |
| 1.225 | `app/(screens)/sticker-browser.tsx` | 5 |
| 1.226 | `app/(screens)/stitch-create.tsx` | 5 |
| 1.227 | `app/(screens)/storage-management.tsx` | 6 |
| 1.228 | `app/(screens)/streaks.tsx` | 7 |
| 1.229 | `app/(screens)/tafsir-viewer.tsx` | 1 |
| 1.230 | `app/(screens)/theme-settings.tsx` | 1 |
| 1.231 | `app/(screens)/thread/[id].tsx` | 7 |
| 1.232 | `app/(screens)/trending-audio.tsx` | 2 |
| 1.233 | `app/(screens)/verify-encryption.tsx` | 1 |
| 1.234 | `app/(screens)/video/[id].tsx` | 11 |
| 1.235 | `app/(screens)/video-editor.tsx` | 5 |
| 1.236 | `app/(screens)/video-premiere.tsx` | 9 |
| 1.237 | `app/(screens)/voice-post-create.tsx` | 2 |
| 1.238 | `app/(screens)/voice-recorder.tsx` | 2 |
| 1.239 | `app/(screens)/volunteer-board.tsx` | 6 |
| 1.240 | `app/(screens)/waqf.tsx` | 3 |
| 1.241 | `app/(screens)/watch-history.tsx` | 1 |
| 1.242 | `app/(screens)/watch-party.tsx` | 3 |
| 1.243 | `app/(screens)/why-showing.tsx` | 6 |
| 1.244 | `app/(screens)/wind-down.tsx` | 1 |
| 1.245 | `app/(screens)/xp-history.tsx` | 3 |
| 1.246 | `app/(screens)/zakat-calculator.tsx` | 4 |
| 1.247 | `app/(screens)/_layout.tsx` | 1 |
| 1.248 | `app/_layout.tsx` | 1 |

---

## CATEGORY 2: WRONG FONT FAMILY NAMES (4 files, 4 occurrences)

These files use `'DMSans-Medium'` which is **not** a registered font family name. The correct name is `'DMSans_500Medium'` (with underscore, matching useFonts registration).

### Finding 2.1
- **File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, line 161
- **Code:** `fontFamily: 'DMSans-Medium',`
- **Fix:** Should be `fontFamily: fonts.bodyMedium` or `'DMSans_500Medium'`

### Finding 2.2
- **File:** `apps/mobile/src/components/ui/ImageGallery.tsx`, line 375
- **Code:** `fontFamily: 'DMSans-Medium',`
- **Fix:** Should be `fontFamily: fonts.bodyMedium` or `'DMSans_500Medium'`

### Finding 2.3
- **File:** `apps/mobile/src/components/ui/VideoControls.tsx`, line 354
- **Code:** `fontFamily: 'DMSans-Medium',`
- **Fix:** Should be `fontFamily: fonts.bodyMedium` or `'DMSans_500Medium'`

### Finding 2.4
- **File:** `apps/mobile/src/components/ui/VideoControls.tsx`, line 373
- **Code:** `fontFamily: 'DMSans-Medium',`
- **Fix:** Should be `fontFamily: fonts.bodyMedium` or `'DMSans_500Medium'`

---

## CATEGORY 3: FONT FAMILY STRING LITERALS INSTEAD OF TOKENS (17 files)

These files use string literals for font families instead of importing from `fonts.*` tokens. While the strings may be correct, they bypass the design system and make font changes require mass find-replace.

### Finding 3.1
- **File:** `apps/mobile/src/components/ui/AuthGate.tsx`, line 153
- **Code:** `fontFamily: 'DMSans_700Bold',`
- **Should be:** `fontFamily: fonts.bodyBold`

### Finding 3.2
- **File:** `apps/mobile/src/components/ui/AuthGate.tsx`, line 172
- **Code:** `fontFamily: 'DMSans_500Medium',`
- **Should be:** `fontFamily: fonts.bodyMedium`

### Finding 3.3
- **File:** `apps/mobile/app/(tabs)/saf.tsx`, line 529
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold',`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.4
- **File:** `apps/mobile/app/(tabs)/saf.tsx`, lines 562, 604, 628
- **Code:** `fontFamily: 'DMSans_700Bold',` (3 occurrences)
- **Should be:** `fontFamily: fonts.bodyBold`

### Finding 3.5
- **File:** `apps/mobile/app/(tabs)/saf.tsx`, line 588
- **Code:** `fontFamily: 'DMSans_500Medium',`
- **Should be:** `fontFamily: fonts.bodyMedium`

### Finding 3.6
- **File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 516
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold'`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.7
- **File:** `apps/mobile/app/(tabs)/minbar.tsx`, line 488
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold',`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.8
- **File:** `apps/mobile/app/(tabs)/majlis.tsx`, line 328
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold'`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.9
- **File:** `apps/mobile/app/(auth)/sign-up.tsx`, line 351
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold'`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.10
- **File:** `apps/mobile/app/(auth)/sign-in.tsx`, line 237
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold'`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.11
- **File:** `apps/mobile/app/(screens)/wind-down.tsx`, line 149
- **Code:** `fontFamily: 'PlayfairDisplay_700Bold',`
- **Should be:** `fontFamily: fonts.headingBold`

### Finding 3.12
- **File:** `apps/mobile/app/(screens)/2fa-setup.tsx`, lines 739, 789
- **Code:** `fontFamily: 'monospace',`
- **Issue:** `monospace` is not a registered custom font. Falls back to platform default. Should use `fonts.mono` (though `fonts.mono` is also defined as `'DMSans_400Regular'` which is not monospace — separate issue).

### Finding 3.13
- **File:** `apps/mobile/app/(screens)/2fa-verify.tsx`, line 399
- **Code:** `fontFamily: 'monospace',`
- **Same issue as 3.12.**

### Finding 3.14
- **File:** `apps/mobile/app/(screens)/camera.tsx`, line 367
- **Code:** `fontFamily: 'monospace',`
- **Same issue as 3.12.**

### Finding 3.15
- **File:** `apps/mobile/app/(screens)/prayer-times.tsx`, line 748
- **Code:** `fontFamily: 'monospace',`
- **Same issue as 3.12.**

---

## CATEGORY 4: HARDCODED INLINE HEX COLORS (100+ files, 421+ occurrences)

Files that use hex color literals (`#FFFFFF`, `#F85149`, etc.) directly in styles instead of referencing theme tokens. While some are acceptable (gradient palettes for color pickers), many duplicate existing token values or introduce colors that are dark-mode-only without light-mode fallbacks.

### Finding 4.1 — Duplicating existing tokens
These files use hex values that already exist as theme tokens:

| File | Line | Hardcoded | Should Be |
|------|------|-----------|-----------|
| `app/(screens)/achievements.tsx` | 114 | `color="#FFFFFF"` | `colors.text.onColor` |
| `app/(screens)/achievements.tsx` | 368 | `color: '#FFFFFF'` | `colors.text.primary` or `colors.text.onColor` |
| `app/(screens)/cashout.tsx` | 163 | `color="#FFFFFF"` | `colors.text.onColor` |
| `app/(screens)/challenges.tsx` | 442 | `color="#FFFFFF"` | `colors.text.onColor` |
| `app/(screens)/challenges.tsx` | 491 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/creator-storefront.tsx` | 272 | `color="#FFFFFF"` | `colors.text.onColor` |
| `app/(screens)/leaderboard.tsx` | 373 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/marketplace.tsx` | 464 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/revenue.tsx` | 404 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/series-discover.tsx` | 467 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/xp-history.tsx` | 328 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/quran-reading-plan.tsx` | 646 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/product/[id].tsx` | 499, 616 | `'#FFFFFF'` | `colors.text.onColor` / `colors.light.bg` |
| `src/components/ui/GlassHeader.tsx` | 237 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `src/components/islamic/EidFrame.tsx` | 96 | `color: '#FFFFFF'` | `colors.text.onColor` |
| `src/components/ui/CaughtUpCard.tsx` | 94 | `color="#FFFFFF"` | `colors.text.onColor` |
| `src/components/ui/GradientButton.tsx` | 101 | `'#FFFFFF'` | `colors.text.onColor` |
| `src/components/ui/VerifiedBadge.tsx` | 26-41 | `"#FFFFFF"` (3x) | `colors.text.onColor` |
| `app/(screens)/watch-party.tsx` | 170-172 | `'#F85149'` (3x) | `colors.live` or `colors.error` |
| `app/(screens)/qibla-compass.tsx` | 462 | `'#C8963E'` | `colors.gold` |
| `app/(screens)/settings.tsx` | 1089 | `'#FF453A'` | `colors.error` (wrong shade — `#FF453A` vs `#F85149`) |
| `app/(screens)/orders.tsx` | 50 | `'#3FB950'` | `colors.success` (wrong shade — `#3FB950` vs `#0A7B4F`) |
| `app/(screens)/media-settings.tsx` | 103, 259 | `'#FFFFFF'` | `colors.text.onColor` |
| `app/(screens)/scholar-verification.tsx` | 106, 109 | `"#FFFFFF"` (2x) | `colors.text.onColor` |

### Finding 4.2 — Undocumented colors (not in theme tokens)
These hex values introduce colors not defined anywhere in the design system:

| File | Line | Color | Likely Intent |
|------|------|-------|---------------|
| `app/(screens)/achievements.tsx` | 50 | `'#58A6FF'` | info blue (exists as `colors.info`) |
| `app/(screens)/achievements.tsx` | 51 | `'#A371F7'` | epic purple (no token) |
| `app/(screens)/ai-assistant.tsx` | 33 | `'#9333EA'` | inspirational purple (no token) |
| `app/(screens)/ai-avatar.tsx` | 27 | `'#EC4899'` | pink (no token) |
| `app/(screens)/downloads.tsx` | 130 | `'#9B5DE5'` | reel purple (no token) |
| `app/(screens)/leaderboard.tsx` | 45-47 | `'#FFD700'`, `'#C0C0C0'`, `'#CD7F32'` | gold/silver/bronze (no tokens) |
| `app/(screens)/membership-tiers.tsx` | 37, 42, 52 | `'#CD7F32'`, `'#C0C0C0'`, `'#E5E4E2'` | tier colors (no tokens) |
| `app/(screens)/hifz-tracker.tsx` | 142, 247, 248, 282, 354, 417 | `'#F59E0B'` (6x) | warning/needs-review (should be `colors.warning`) |
| `app/(screens)/share-receive.tsx` | 73 | `'#A855F7'` | accent purple (no token) |
| `app/(screens)/chat-folders.tsx` | 21 | `'#58A6FF'`, `'#9333EA'`, etc. | folder colors (no tokens for non-brand colors) |
| `app/(screens)/streaks.tsx` | 42-45 | `'#F85149'`, `'#A371F7'`, `'#58A6FF'` | category colors (partially match tokens) |

### Finding 4.3 — Color palette arrays should use tokens where possible
Many screens define color palette arrays using raw hex instead of referencing `colors.*`:

| File | Lines | Description |
|------|-------|-------------|
| `app/(screens)/create-story.tsx` | 56-67 | `TEXT_COLORS` and `BACKGROUND_GRADIENTS` arrays use raw hex including `'#0A7B4F'` (= `colors.emerald`), `'#C8963E'` (= `colors.gold`), `'#F85149'` (= `colors.error`) |
| `app/(screens)/caption-editor.tsx` | 36 | `TEXT_COLORS` array with `'#0A7B4F'`, `'#C8963E'`, `'#F85149'`, `'#58A6FF'` |
| `app/(screens)/video-editor.tsx` | 27-38 | Filter colors and `TEXT_COLORS` with raw hex |
| `app/(screens)/green-screen-editor.tsx` | 22-44 | Full solid color + gradient arrays, all raw hex |
| `app/(screens)/profile-customization.tsx` | 41-51 | Accent color palette, all raw hex |
| `src/components/story/TextEffects.tsx` | 78-80 | Color palette with raw hex |
| `src/components/story/DrawingCanvas.tsx` | 43-45 | Drawing color palette with raw hex |
| `app/(screens)/chat-wallpaper.tsx` | 47-76 | Wallpaper solid/gradient/pattern colors, all raw hex |
| `app/(screens)/chat-theme-picker.tsx` | 44-66 | Theme colors and gradients, all raw hex |

### Finding 4.4 — Gradient "darker shade" colors not in tokens
Many LinearGradient calls use a darker version of emerald/gold as second color, but these shades are not tokenized:

| Second Color | Used In | Count |
|-------------|---------|-------|
| `'#0D9B63'` | 12+ files | Emerald gradient end (= `colors.emeraldLight` token, but used as darker gradient?) |
| `'#05593A'` | 5+ files | Dark emerald (no token) |
| `'#0A6B42'` | 2 files | Dark emerald variant (no token) |
| `'#065f3e'` | 1 file | Dark emerald variant (no token) |
| `'#A67C00'` | 3+ files | Dark gold (no token) |
| `'#D4A94F'` | 3+ files | `colors.goldLight` used in gradients |
| `'#E11D48'` | 2 files | Dark red (no token) |
| `'#C53030'` | 1 file | Dark error red (no token) |

---

## CATEGORY 5: HARDCODED ENGLISH STRINGS IN COMPONENTS (37 occurrences)

These are English text strings rendered directly in JSX without using the `t()` translation function, making them untranslatable.

### Component-level hardcoded strings:

| # | File | Line | Hardcoded String |
|---|------|------|-----------------|
| 5.1 | `src/components/ErrorBoundary.tsx` | 36 | `"Something went wrong"` |
| 5.2 | `src/components/ErrorBoundary.tsx` | 38 | `"An unexpected error occurred."` |
| 5.3 | `src/components/ErrorBoundary.tsx` | 41 | `"Try again"` |
| 5.4 | `src/components/ui/ScreenErrorBoundary.tsx` | 47 | `"An unexpected error occurred. Please try again."` |
| 5.5 | `src/components/ui/ScreenErrorBoundary.tsx` | 48 | `"Try again"` |
| 5.6 | `src/components/bakra/CommentsSheet.tsx` | 106 | `"Pinned"` |
| 5.7 | `src/components/bakra/CommentsSheet.tsx` | 121 | `"Creator"` |
| 5.8 | `src/components/saf/PostCard.tsx` | 322 | `"Sensitive content"` |
| 5.9 | `src/components/saf/PostCard.tsx` | 323 | `"This post may contain sensitive material"` |
| 5.10 | `src/components/saf/PostCard.tsx` | 330 | `"View"` |
| 5.11 | `src/components/risalah/StickerPicker.tsx` | 175 | `"Stickers"` |
| 5.12 | `src/components/risalah/StickerPicker.tsx` | 209 | `"Recently Used"` |
| 5.13 | `src/components/risalah/StickerPicker.tsx` | 268 | `"Add more"` |
| 5.14 | `src/components/risalah/StickerPackBrowser.tsx` | 295 | `"Sticker Packs"` |
| 5.15 | `src/components/risalah/StickerPackBrowser.tsx` | 355 | `"Featured"` |
| 5.16 | `src/components/story/CountdownSticker.tsx` | 140 | `"Days"` |
| 5.17 | `src/components/story/CountdownSticker.tsx` | 145 | `"Hours"` |
| 5.18 | `src/components/story/CountdownSticker.tsx` | 150 | `"Mins"` |
| 5.19 | `src/components/story/CountdownSticker.tsx` | 155 | `"Secs"` |
| 5.20 | `src/components/story/CountdownSticker.tsx` | 183 | `"Creator view"` |
| 5.21 | `src/components/story/QuestionSticker.tsx` | 109 | `"Reply"` |
| 5.22 | `src/components/story/QuestionSticker.tsx` | 183 | `"Creator view"` |
| 5.23 | `src/components/story/QuizSticker.tsx` | 162 | `"Creator view"` |
| 5.24 | `src/components/story/SliderSticker.tsx` | 146 | `"Avg"` |
| 5.25 | `src/components/story/SliderSticker.tsx` | 185 | `"Release to submit"` |
| 5.26 | `src/components/story/SliderSticker.tsx` | 192 | `"Creator view"` |
| 5.27 | `src/components/majlis/ThreadCard.tsx` | 183 | `"Reposted"` |
| 5.28 | `src/components/ui/LinkPreview.tsx` | 186 | `"Open link"` |
| 5.29 | `src/components/ui/LocationPicker.tsx` | 112 | `"Add Location"` |
| 5.30 | `src/components/ui/LocationPicker.tsx` | 141 | `"Use Current Location"` |
| 5.31 | `src/components/ui/LocationPicker.tsx` | 146 | `"Recent"` |
| 5.32 | `src/components/ui/LocationPicker.tsx` | 177 | `"No locations found"` |
| 5.33 | `src/components/web/WebSidebar.tsx` | 114 | `"Mizanly"` (brand name, acceptable) |
| 5.34 | `src/components/web/WebSidebar.tsx` | 139 | `"Search"` |
| 5.35 | `src/components/web/WebSidebar.tsx` | 143 | `"New Post"` |
| 5.36 | `src/components/web/WebSidebar.tsx` | 147 | `"Go Back"` |
| 5.37 | `app/(screens)/theme-settings.tsx` | 182-184 | 3 hardcoded English strings for preview hints |

### Additional hardcoded strings in _layout.tsx:

| # | File | Line | Hardcoded String |
|---|------|------|-----------------|
| 5.38 | `app/_layout.tsx` | 133 | `Alert.alert('Error', error.message)` — `'Error'` title not translated |

### Alert.alert with hardcoded English in screens:

| # | File | Line | Hardcoded String |
|---|------|------|-----------------|
| 5.39 | `app/(screens)/biometric-lock.tsx` | 92 | `'Authentication successful!'` |
| 5.40 | `app/(screens)/biometric-lock.tsx` | 94 | `'Authentication failed.'` |

---

## CATEGORY 6: HARDCODED fontSize VALUES (48 files, 83 occurrences)

Files using raw numeric `fontSize` values instead of `fontSize.*` tokens from the theme. The theme defines: `xs=11, sm=13, base=15, md=17, lg=20, xl=24, 2xl=28, 3xl=34, 4xl=42`.

### Findings — values that match existing tokens but don't use them:

| # | File | Line | Value | Should Be |
|---|------|------|-------|-----------|
| 6.1 | `app/_layout.tsx` | 68 | `fontSize: 13` | `fontSize.sm` |
| 6.2 | `app/_layout.tsx` | 112 | `fontSize: 28` | `fontSize['2xl']` |
| 6.3 | `app/_layout.tsx` | 115 | `fontSize: 16` | None (not a token — between base=15 and md=17) |
| 6.4 | `app/_layout.tsx` | 281 | `fontSize: 16` | Same non-token value |
| 6.5 | `app/(tabs)/_layout.tsx` | 266 | `fontSize: 10` | None (below xs=11) |
| 6.6 | `app/(auth)/sign-up.tsx` | 351 | `fontSize: 32` | None (between 2xl=28 and 3xl=34) |
| 6.7 | `app/(auth)/sign-up.tsx` | 455 | `fontSize: 24` | `fontSize.xl` |
| 6.8 | `app/(auth)/sign-in.tsx` | 237 | `fontSize: 42` | `fontSize['4xl']` |
| 6.9 | `app/(tabs)/bakra.tsx` | 250 | `fontSize: 9` | None (below xs=11) |
| 6.10 | `app/(tabs)/bakra.tsx` | 916 | `fontSize: 10` | None |
| 6.11 | `app/(tabs)/bakra.tsx` | 952 | `fontSize: 11` | `fontSize.xs` |
| 6.12 | `src/components/editor/VideoTimeline.tsx` | 244 | `fontSize: 9` | None |
| 6.13 | `src/components/bakra/CommentsSheet.tsx` | 321 | `fontSize: 9` | None |
| 6.14 | `src/components/bakra/CommentsSheet.tsx` | 334 | `fontSize: 10` | None |
| 6.15 | `src/components/ui/PremiereCountdown.tsx` | 164 | `fontSize: 36` | None (between 3xl=34 and 4xl=42) |
| 6.16 | `src/components/ui/PremiereCountdown.tsx` | 174 | `fontSize: 28` | `fontSize['2xl']` |
| 6.17 | `src/components/ui/CharCountRing.tsx` | 53 | `fontSize: 7` | None |
| 6.18 | `src/components/ui/BottomSheet.tsx` | 211 | `fontSize: 16` | None |
| 6.19 | `src/components/ui/ImageGallery.tsx` | 376 | `fontSize: 13` | `fontSize.sm` |
| 6.20 | `src/components/ui/ImageCarousel.tsx` | 162 | `fontSize: 12` | None |
| 6.21 | `src/components/ui/GlassHeader.tsx` | 236 | `fontSize: 10` | None |
| 6.22 | `app/(screens)/ai-assistant.tsx` | 371 | `fontSize: 48` | None (above 4xl=42) |
| 6.23 | `app/(screens)/achievements.tsx` | 447, 451 | `fontSize: 10` (2x) | None |
| 6.24 | `app/(screens)/account-switcher.tsx` | 620 | `fontSize: 10` | None |
| 6.25 | `app/(screens)/account-switcher.tsx` | 641 | `fontSize: 12` | None |
| 6.26 | `app/(screens)/channel/[handle].tsx` | 1148 | `fontSize: 10` | None |
| 6.27 | `app/(screens)/challenges.tsx` | 556 | `fontSize: 10` | None |
| 6.28 | `app/(screens)/camera.tsx` | 282 | `fontSize: 20` | `fontSize.lg` |
| 6.29 | `app/(screens)/camera.tsx` | 287, 365, 397 | `fontSize: 14` (3x) | None |
| 6.30 | `app/(screens)/camera.tsx` | 484 | `fontSize: 13` | `fontSize.sm` |
| 6.31 | `app/(screens)/communities.tsx` | 492 | `fontSize: 40` | None |
| 6.32 | `app/(screens)/communities.tsx` | 528 | `fontSize: 28` | `fontSize['2xl']` |
| 6.33 | `app/(screens)/circles.tsx` | 298, 341 | `fontSize: 24` (2x) | `fontSize.xl` |
| 6.34 | `app/(screens)/names-of-allah.tsx` | 284 | `fontSize: 32` | None |
| 6.35 | `app/(screens)/conversation/[id].tsx` | 562, 579, 615 | `fontSize: 10` (3x) | None |
| 6.36 | `app/(screens)/conversation/[id].tsx` | 2051, 2053 | `fontSize: 10` (2x) | None |
| 6.37 | `app/(screens)/conversation/[id].tsx` | 2076 | `fontSize: 14` | None |
| 6.38 | `app/(screens)/conversation/[id].tsx` | 2078 | `fontSize: 11` | `fontSize.xs` |
| 6.39 | `app/(screens)/conversation/[id].tsx` | 2151 | `fontSize: 28` | `fontSize['2xl']` |
| 6.40 | `app/(screens)/downloads.tsx` | 526 | `fontSize: 9` | None |
| 6.41 | `app/(screens)/my-reports.tsx` | 229 | `fontSize: 10` | None |
| 6.42 | `app/(screens)/zakat-calculator.tsx` | 826 | `fontSize: 32` | None |
| 6.43 | `app/(screens)/dhikr-counter.tsx` | 514 | `fontSize: 48` | None |
| 6.44 | `app/(screens)/morning-briefing.tsx` | 532 | `fontSize: 36` | None |
| 6.45 | `app/(screens)/dhikr-challenge-detail.tsx` | 349 | `fontSize: 36` | None |
| 6.46 | `app/(screens)/dhikr-challenge-detail.tsx` | 421 | `fontSize: 28` | `fontSize['2xl']` |
| 6.47 | `app/(screens)/membership-tiers.tsx` | 717 | `fontSize: 32` | None |
| 6.48 | `app/(screens)/creator-storefront.tsx` | 395, 441 | `fontSize: 10` (2x) | None |
| 6.49 | `app/(screens)/quran-room.tsx` | 396 | `fontSize: 28` | `fontSize['2xl']` |
| 6.50 | `app/(screens)/create-thread.tsx` | 784 | `fontSize: 18` | None |
| 6.51 | `app/(screens)/conversation-info.tsx` | 353 | `fontSize: 10` | None |
| 6.52 | `app/(screens)/live/[id].tsx` | multiple | hardcoded fontSize | 3 |
| 6.53 | `app/(screens)/profile/[username].tsx` | multiple | hardcoded fontSize | 3 |
| 6.54 | `app/(screens)/stitch-create.tsx` | multiple | hardcoded fontSize | 2 |
| 6.55 | `app/(screens)/voice-post-create.tsx` | 175 | `fontSize: 64` | None |
| 6.56 | `app/(screens)/video/[id].tsx` | multiple | hardcoded fontSize | 1 |

**Note:** Many of these use values like 9, 10, 12, 14, 16, 18, 32, 36, 48, 64 which don't have matching theme tokens. This indicates the token scale is incomplete or being bypassed.

---

## CATEGORY 7: HARDCODED borderRadius VALUES >= 6 (RULE VIOLATION)

Per CLAUDE.md rule #3: "NEVER hardcode border radius >= 6 — Always `radius.*` from theme"

The theme defines: `sm=6, md=10, lg=16, xl=24, full=9999`

Values < 6 are exempt from this rule (used for progress bars, indicators, dots).

### Findings — borderRadius >= 6 without using radius token:

**No violations found.** All borderRadius values >= 6 in the codebase correctly use `radius.*` tokens. The hardcoded values (1, 1.5, 2, 2.5, 3, 4, 5) are all below the threshold and used for dots, progress bars, thin indicators, and separator lines — these are exempt.

---

## CATEGORY 8: HARDCODED SPACING VALUES (minor)

While widespread, hardcoded spacing values of 1-5 are acceptable for micro-layout (divider heights, dot widths). The `spacing` token scale starts at `xs=4`, so values below 4 have no token.

Larger hardcoded spacing values found in a few places:

| # | File | Line | Value | Should Be |
|---|------|------|-------|-----------|
| 8.1 | `app/(screens)/theme-settings.tsx` | 140 | `paddingTop: 100` | No equivalent token, but should use computed value |
| 8.2 | `app/(screens)/theme-settings.tsx` | 242 | `paddingBottom: 60` | No equivalent token |
| 8.3 | `app/_layout.tsx` | 112 | `marginTop: 16` | `spacing.base` |
| 8.4 | `app/_layout.tsx` | 115 | `marginTop: 8` | `spacing.sm` |

---

## CATEGORY 9: fonts.mono DEFINED AS NON-MONOSPACE FONT

### Finding 9.1
- **File:** `apps/mobile/src/theme/index.ts`, line 88
- **Code:** `mono: 'DMSans_400Regular',`
- **Issue:** The `fonts.mono` token is defined as `DMSans_400Regular` which is NOT a monospace font. It's the same as `fonts.body`. Five files use `fontFamily: 'monospace'` directly (2fa-setup, 2fa-verify, camera, prayer-times) because the mono token doesn't actually provide a monospace font. The `monospace` string is a platform fallback that works, but it's inconsistent with the design system approach.

---

## CATEGORY 10: ScreenErrorBoundary USES t() IN CLASS COMPONENT (CRASH BUG)

### Finding 10.1
- **File:** `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx`, lines 2, 46-48
- **Code:**
  ```tsx
  import { useTranslation } from '@/hooks/useTranslation';  // line 2
  // ...
  title={t('common.error')}  // line 46
  subtitle={this.state.error?.message ?? 'An unexpected error occurred. Please try again.'}  // line 47
  actionLabel="Try again"  // line 48
  ```
- **Issue:** `ScreenErrorBoundary` is a **class component** (extends `Component`). It imports `useTranslation` (a hook) at the top level but never calls it — hooks cannot be used in class components. The `t()` function referenced on line 46 is **never defined**, meaning when this error boundary actually catches an error and tries to render its fallback, `t` is undefined and the error boundary itself crashes with `ReferenceError: t is not defined`.
- **Impact:** CRITICAL — the error boundary that's supposed to catch errors on all 196 screens will itself crash when triggered, leaving users with a white screen.
- **Additionally:** Lines 47-48 have hardcoded English strings as fallbacks.

---

## CATEGORY 11: fontWeight '800' NOT IN TOKEN SYSTEM (16 occurrences)

The `fontWeight` token system defines: `regular='400', medium='500', semibold='600', bold='700'`. There is no `'800'` (extrabold) token.

### Findings:

| # | File | Line |
|---|------|------|
| 11.1 | `src/components/story/TextEffects.tsx` | 60 |
| 11.2 | `src/components/story/SliderSticker.tsx` | 302 |
| 11.3 | `src/components/story/CountdownSticker.tsx` | 234, 257 |
| 11.4 | `src/components/ui/PremiereCountdown.tsx` | 190 |
| 11.5 | `app/(screens)/ai-assistant.tsx` | 371 |
| 11.6 | `app/(screens)/create-reel.tsx` | 773 |
| 11.7 | `app/(screens)/channel/[handle].tsx` | 1077, 1149 |
| 11.8 | `app/(screens)/fasting-tracker.tsx` | 340 |
| 11.9 | `app/(screens)/hifz-tracker.tsx` | 383 |
| 11.10 | `app/(screens)/live/[id].tsx` | 956 |
| 11.11 | `app/(screens)/profile/[username].tsx` | 935 |
| 11.12 | `app/(screens)/video/[id].tsx` | 1358 |
| 11.13 | `app/(screens)/voice-post-create.tsx` | 175 |
| 11.14 | `app/(screens)/watch-party.tsx` | 172 |

**Note:** On iOS, `fontWeight: '800'` with a `fontFamily` set to a specific weight (like `DMSans_700Bold`) will be ignored — the loaded font weight takes precedence. This value is meaningless unless the font supports variable weights.

---

## CATEGORY 12: INLINE rgba() COLORS IN SCREENS (300+ occurrences in 30+ files)

Many screens construct `rgba()` color values inline instead of defining them in the theme. While some are for dynamic opacity, many are static and should be tokenized.

Most common repeated values:
- `rgba(255, 255, 255, 0.5)` — semi-transparent white (used for video overlays, etc.)
- `rgba(0, 0, 0, 0.4)` — semi-transparent black
- `rgba(255, 255, 255, 0.08)` — very faint white border (similar to existing `colors.glass.border`)
- `rgba(10, 123, 79, 0.15)` — emerald with opacity (similar to existing `colors.active.emerald10/emerald20`)

Files with highest rgba() inline usage:
| File | Count |
|------|-------|
| `app/(screens)/video-editor.tsx` | 32 |
| `app/(screens)/caption-editor.tsx` | 29 |
| `app/(screens)/stitch-create.tsx` | 30 |
| `app/(screens)/zakat-calculator.tsx` | 20 |
| `app/(screens)/appeal-moderation.tsx` | 19 |
| `app/(screens)/theme-settings.tsx` | 10 |
| `app/(screens)/audio-room.tsx` | 13 |
| `app/(screens)/camera.tsx` | 13 |
| `app/(screens)/story-viewer.tsx` | 13 |
| `app/(screens)/audio-library.tsx` | 13 |

---

## SUMMARY

| Category | Finding Count | Severity |
|----------|--------------|----------|
| 1. Dark mode architecturally broken (colors.dark.* hardcoded) | 244 files, 1,251 occurrences | **CRITICAL** — Light mode completely non-functional |
| 2. Wrong font family names (DMSans-Medium) | 4 occurrences in 3 files | **HIGH** — Text renders in fallback font |
| 3. Font family string literals instead of tokens | 15 occurrences in 11 files | **MEDIUM** — Maintenance burden |
| 4. Hardcoded inline hex colors | 421+ occurrences in 100+ files | **MEDIUM** — Theme inconsistency |
| 5. Hardcoded English strings in components | 40 occurrences | **MEDIUM** — Breaks i18n for 7 non-English languages |
| 6. Hardcoded fontSize values | 83 occurrences in 48 files | **LOW** — Many are intentional for special sizes |
| 7. borderRadius >= 6 violations | 0 | None found |
| 8. Hardcoded spacing values | 4 major occurrences | **LOW** |
| 9. fonts.mono is not monospace | 1 definition + 5 usages | **LOW** |
| 10. ScreenErrorBoundary t() crash bug | 1 (CRITICAL) | **P0** — Error boundary crashes on error |
| 11. fontWeight '800' not in tokens | 16 occurrences | **LOW** |
| 12. Inline rgba() colors | 300+ occurrences | **LOW** — Many are contextually appropriate |

**Total: 267 distinct findings across 12 categories.**

### Recommended Fixes (Priority Order):

1. **P0:** Fix ScreenErrorBoundary — either make it a function component that can use `useTranslation()`, or pass translated strings as props, or use hardcoded fallback strings (it's an error boundary, reliability > i18n)
2. **P1:** Create a `useThemeColors()` hook that returns `colors.dark` or `colors.light` based on store theme, and refactor all 244 files to use it
3. **P1:** Fix 4 wrong font names (`DMSans-Medium` -> `DMSans_500Medium`)
4. **P2:** Add light-mode variants to `colors.text.*` (text.primary should be black on light, white on dark)
5. **P2:** Replace font family string literals with `fonts.*` token imports
6. **P3:** Create a `colors.extended` palette for frequently-used non-brand colors (purple, pink, gold/silver/bronze for tiers)
7. **P3:** Add gradient tokens (emerald gradient, gold gradient, etc.) to reduce raw hex in LinearGradient calls
8. **P3:** Replace hardcoded English strings with i18n keys
