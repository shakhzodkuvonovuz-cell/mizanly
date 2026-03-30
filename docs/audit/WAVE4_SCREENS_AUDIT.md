# WAVE 4 — MOBILE SCREENS DEEP UX AUDIT (42 agents, 4 batches)

> **This replaces the Wave 4 section in AUDIT_V2_PART2.md.** 206 screen files across 42 agents (5 screens each). Every possible UI/UX scenario.

---

## WHY 42 AGENTS, NOT 20

V1 used 20 agents at 10 screens each. They found surface issues — "missing accessibilityLabel", "no RTL support." They missed:
- Buttons that do nothing
- Toggles that don't persist
- Forms that can't submit
- Lists that don't paginate
- Screens that crash on empty data
- Features that are complete facades (UI exists, logic is a no-op)
- Dead navigation (screen exists but no route reaches it)
- Stale state after mutations (list doesn't refresh after create/delete)

5 screens per agent. Read every line. Not skim — READ.

---

## THE COMPLETE UX AUDIT CHECKLIST (46 checks)

**Every agent applies ALL 46 checks to EVERY screen in its scope.** Not just the ones that seem relevant — ALL of them. A settings screen still needs haptic feedback. A camera screen still needs error handling.

### A. VISUAL & LAYOUT (9 checks)
1. **Light mode:** Screen uses `useThemeColors()` → `tc.*`. No `colors.dark.*` or hardcoded hex in `StyleSheet.create()`. Light mode must render correctly — dark text on dark background is a Critical.
2. **RTL layout:** `marginLeft`→`marginStart`, `paddingLeft`→`paddingStart`, `left`→`start`, `right`→`end`, `textAlign:'left'`→`textAlign:'start'`. Arabic and Urdu users see mirrored layouts.
3. **Safe area:** `SafeAreaView` or `useSafeAreaInsets` wraps content. No content hidden behind notch, Dynamic Island, or home indicator.
4. **Status bar:** Status bar style matches screen background (light content on dark bg, dark content on light bg). Not the wrong contrast.
5. **Border radius:** Uses `radius.*` from theme tokens (`radius.sm=6`, `radius.md=10`, `radius.lg=16`, `radius.full=9999`). Never hardcoded `borderRadius: 12` or similar.
6. **Spacing:** Uses `spacing.*` tokens (`xs=4`, `sm=8`, `md=12`, `base=16`, `lg=20`, `xl=24`, `2xl=32`). Minimal hardcoded pixel values.
7. **Typography:** Uses `fontSize.*` tokens. No hardcoded font sizes that break the type scale.
8. **Responsive:** No `Dimensions.get('window').width` for layout calculations — breaks on iPad, foldable, orientation change. Use `useWindowDimensions` or flex layout.
9. **Scroll behavior:** Long content scrolls. Keyboard doesn't overlap inputs. Scroll indicators appropriate. No cut-off content at bottom.

### B. INTERACTION & FEEDBACK (11 checks)
10. **Haptic feedback:** `useContextualHaptic()` on ALL interactive elements — buttons, toggles, swipes, long-press. Never bare `useHaptic()`. Never zero haptics on an interactive screen.
11. **Press feedback:** Buttons/touchables have visual press state — `Pressable` with `onPressIn`/`onPressOut` scale or opacity. Not flat/unresponsive on press.
12. **Disabled state:** Buttons show disabled appearance AND prevent action when: form incomplete, mutation in progress, rate-limited. No active-looking buttons that silently fail.
13. **Double-tap prevention:** Mutation buttons can't be tapped twice rapidly (disable on first tap, re-enable after response). Without this: double-follows, double-likes, double-payments.
14. **Destructive confirmation:** Delete, block, ban, unfollow, leave group — all use `BottomSheet` or `Alert.alert` with two options. Never a single-tap destructive action. Never `Alert.alert` for non-destructive feedback.
15. **Toast feedback:** `showToast()` after successful mutations (save, delete, follow, copy, share). User must know the action worked. Never silent success.
16. **Long-press menus:** Content items (posts, messages, comments, images) should have long-press context menu (copy, share, report, delete, save). Check if `onLongPress` exists and does something useful.
17. **Pull-to-refresh:** `<BrandedRefreshControl>` on all scrollable data screens. Never raw `<RefreshControl>`. Never a data screen with no way to refresh.
18. **Swipe gestures:** Where expected — swipe to delete in lists, swipe to reply in chat, swipe between tabs/stories. Are gestures implemented or missing?
19. **Keyboard handling:** `KeyboardAvoidingView` on every screen with `TextInput`. Input must stay visible when keyboard opens. Test: would typing in this input cause the keyboard to cover it?
20. **Scroll-to-input:** On forms with multiple inputs, tapping a lower input auto-scrolls it into view above the keyboard.

### C. DATA & STATE (10 checks)
21. **Real API calls:** Data screens fetch from backend API — not hardcoded arrays, not `Math.random()`, not `setTimeout` fake loading, not "Coming Soon" facades.
22. **Loading state:** `<Skeleton>` components during initial data fetch. NOT `<ActivityIndicator>` for content loading (buttons/inline OK). Skeleton shapes should match the content layout.
23. **Error state:** API failure shows meaningful error message with retry option. NOT blank screen. NOT unhandled crash. NOT generic "Something went wrong" with no retry.
24. **Empty state:** `<EmptyState>` component when list/data is empty. NOT bare "No items" text. NOT invisible (blank area where content should be). Should have illustration + message + optional CTA.
25. **Pagination:** Lists with potentially many items use cursor pagination or infinite scroll. NOT loading all items at once. Check: does `onEndReached` exist? Does it load more?
26. **Optimistic updates:** Mutations that affect visible UI (like, follow, bookmark, delete) update immediately on tap, revert on error. NOT waiting for API response to show change.
27. **Stale data:** After a mutation (create post, delete comment, follow user), the affected list/screen refetches or updates. NOT showing stale data until manual refresh. Check: `queryClient.invalidateQueries` or `refetch()` after mutations.
28. **Back navigation state:** Going back preserves scroll position and form state. Returning to a list doesn't jump to top. Partially filled forms don't lose content.
29. **Offline behavior:** What happens with no network? Blank screen? Cached data? Error with retry? At minimum: error message, not silent blank.
30. **Concurrent state:** Multiple rapid taps, fast back-forward navigation, background/foreground transitions — does the screen handle these without crash or stale data?

### D. ANIMATION & POLISH (6 checks)
31. **Entrance animation:** Lists use staggered entrance (items fade/slide in sequentially). NOT all items appearing at once in a jarring snap.
32. **Transition animation:** Navigation transitions are smooth. No jarring instant-swap between screens. Shared element transitions where appropriate (profile photo, post image).
33. **Image loading:** Content images use `<ProgressiveImage>` with blurhash placeholder → fade to full image. NOT raw `<Image>` from expo-image with no placeholder (shows blank then jumps to loaded).
34. **Layout stability:** No content jumping after load (skeleton → content should be same size). No CLS-style shifts when images load, ads appear, or dynamic content arrives.
35. **Scroll-linked animations:** Headers collapse smoothly on scroll (elastic, not choppy). Tab bars respond to scroll direction. No janky animation frames.
36. **Micro-interactions:** Like animations (heart burst), follow confirmation, bookmark toggle, send animation. These make the app feel alive vs dead. Report MISSING micro-interactions on high-traffic screens (feed, profile, chat).

### E. COMPONENT COMPLIANCE (8 checks)
37. **ProgressiveImage not Image:** Every user-uploaded photo/video thumbnail uses `<ProgressiveImage>`, never raw `<Image>` from expo-image.
38. **Skeleton not ActivityIndicator:** Content loading uses `<Skeleton>`, never `<ActivityIndicator>` for content areas.
39. **EmptyState not bare text:** Empty lists use `<EmptyState>` component, never bare "No items" or invisible empty area.
40. **BottomSheet not Modal:** All modal-like overlays use `<BottomSheet>`, never RN `<Modal>`.
41. **Icon component not emoji:** UI icons use `<Icon name="..." />`, never text emoji as icons.
42. **BrandedRefreshControl not RefreshControl:** Pull-to-refresh uses branded version, never raw.
43. **showToast not Alert.alert:** Mutation feedback uses `showToast()`, never `Alert.alert` for non-destructive feedback. `Alert.alert` ONLY for destructive confirmations.
44. **useContextualHaptic not useHaptic:** Haptic feedback uses the contextual variant, never the old bare hook.

### F. FUNCTIONALITY & COMPLETENESS (2 checks)
45. **Every interactive element works:** Buttons have real `onPress` handlers that DO something (not `console.log`, not empty function, not `// TODO`). Toggles persist to API or local state. Sliders control real values. Inputs validate. Forms submit. If a feature is a facade (UI exists, logic is no-op), report as Critical.
46. **Navigation reachable:** Can a user actually reach this screen from the app? Is there a button/link/tab that navigates here? Or is it an orphaned screen with no route to it?

---

## AGENT ASSIGNMENTS (42 agents, 5 screens each)

### Batch 1 (11 agents — spawn all at once)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D01 | `docs/audit/v2/wave4/D01.md` | `2fa-setup`, `2fa-verify`, `account-settings`, `account-switcher`, `achievements` |
| D02 | `docs/audit/v2/wave4/D02.md` | `ai-assistant`, `ai-avatar`, `analytics`, `appeal-moderation`, `archive` |
| D03 | `docs/audit/v2/wave4/D03.md` | `audio-library`, `audio-room`, `banned`, `biometric-lock`, `blocked-keywords` |
| D04 | `docs/audit/v2/wave4/D04.md` | `blocked`, `bookmark-collections`, `bookmark-folders`, `boost-post`, `branded-content` |
| D05 | `docs/audit/v2/wave4/D05.md` | `broadcast-channels`, `broadcast/[id]`, `call-history`, `call/[id]`, `camera` |
| D06 | `docs/audit/v2/wave4/D06.md` | `caption-editor`, `cashout`, `challenges`, `channel/[handle]`, `charity-campaign` |
| D07 | `docs/audit/v2/wave4/D07.md` | `chat-export`, `chat-folder-view`, `chat-folders`, `chat-lock`, `chat-theme-picker` |
| D08 | `docs/audit/v2/wave4/D08.md` | `chat-wallpaper`, `circles`, `close-friends`, `collab-requests`, `communities` |
| D09 | `docs/audit/v2/wave4/D09.md` | `community-guidelines`, `community-posts`, `contact-sync`, `content-filter-settings`, `content-settings` |
| D10 | `docs/audit/v2/wave4/D10.md` | `conversation/[id]`, `conversation-info`, `conversation-media`, `create-broadcast`, `create-carousel` |
| D11 | `docs/audit/v2/wave4/D11.md` | `create-clip`, `create-event`, `create-group`, `create-playlist`, `create-post` |

### Batch 2 (11 agents — spawn after Batch 1 files verified)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D12 | `docs/audit/v2/wave4/D12.md` | `create-reel`, `create-story`, `create-thread`, `create-video`, `creator-dashboard` |
| D13 | `docs/audit/v2/wave4/D13.md` | `creator-storefront`, `cross-post`, `dhikr-challenge-detail`, `dhikr-challenges`, `dhikr-counter` |
| D14 | `docs/audit/v2/wave4/D14.md` | `disappearing-default`, `disappearing-settings`, `discover`, `disposable-camera`, `dm-note-editor` |
| D15 | `docs/audit/v2/wave4/D15.md` | `donate`, `downloads`, `drafts`, `dua-collection`, `duet-create` |
| D16 | `docs/audit/v2/wave4/D16.md` | `edit-channel`, `edit-profile`, `eid-cards`, `enable-tips`, `end-screen-editor` |
| D17 | `docs/audit/v2/wave4/D17.md` | `event-detail`, `fasting-tracker`, `fatwa-qa`, `flipside`, `follow-requests` |
| D18 | `docs/audit/v2/wave4/D18.md` | `followed-topics`, `followers/[userId]`, `following/[userId]`, `gift-shop`, `go-live` |
| D19 | `docs/audit/v2/wave4/D19.md` | `green-screen-editor`, `hadith`, `hajj-companion`, `hajj-step`, `halal-finder` |
| D20 | `docs/audit/v2/wave4/D20.md` | `hashtag/[tag]`, `hashtag-explore`, `hifz-tracker`, `image-editor`, `invite-friends` |
| D21 | `docs/audit/v2/wave4/D21.md` | `islamic-calendar`, `leaderboard`, `link-child-account`, `live/[id]`, `local-boards` |
| D22 | `docs/audit/v2/wave4/D22.md` | `location-picker`, `maintenance`, `majlis-list/[id]`, `majlis-lists`, `manage-broadcast` |

### Batch 3 (11 agents — spawn after Batch 2 files verified)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D23 | `docs/audit/v2/wave4/D23.md` | `manage-data`, `marketplace`, `media-settings`, `membership-tiers`, `mentorship` |
| D24 | `docs/audit/v2/wave4/D24.md` | `morning-briefing`, `mosque-finder`, `muted`, `mutual-followers`, `my-reports` |
| D25 | `docs/audit/v2/wave4/D25.md` | `names-of-allah`, `nasheed-mode`, `new-conversation`, `notification-tones`, `notifications` |
| D26 | `docs/audit/v2/wave4/D26.md` | `orders`, `parental-controls`, `photo-music`, `pinned-messages`, `playlist/[id]` |
| D27 | `docs/audit/v2/wave4/D27.md` | `playlists/[channelId]`, `post/[id]`, `post-insights`, `prayer-times`, `product/[id]` |
| D28 | `docs/audit/v2/wave4/D28.md` | `product-detail`, `profile/[username]`, `profile-customization`, `qibla-compass`, `qr-code` |
| D29 | `docs/audit/v2/wave4/D29.md` | `qr-scanner`, `quiet-mode`, `quran-reading-plan`, `quran-room`, `quran-share` |
| D30 | `docs/audit/v2/wave4/D30.md` | `ramadan-mode`, `reel/[id]`, `reel-remix`, `reel-templates`, `report` |
| D31 | `docs/audit/v2/wave4/D31.md` | `reports/[id]`, `restricted`, `revenue`, `safety-center`, `save-to-playlist` |
| D32 | `docs/audit/v2/wave4/D32.md` | `saved`, `saved-messages`, `schedule-live`, `schedule-post`, `scholar-verification` |
| D33 | `docs/audit/v2/wave4/D33.md` | `screen-time`, `search`, `search-results`, `send-tip`, `series/[id]` |

### Batch 4 (9 agents — spawn after Batch 3 files verified)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D34 | `docs/audit/v2/wave4/D34.md` | `series-detail`, `series-discover`, `settings`, `share-profile`, `share-receive` |
| D35 | `docs/audit/v2/wave4/D35.md` | `sound/[id]`, `starred-messages`, `status-privacy`, `sticker-browser`, `stitch-create` |
| D36 | `docs/audit/v2/wave4/D36.md` | `storage-management`, `story-viewer`, `streaks`, `surah-browser`, `tafsir-viewer` |
| D37 | `docs/audit/v2/wave4/D37.md` | `theme-settings`, `thread/[id]`, `trending-audio`, `verify-encryption`, `video/[id]` |
| D38 | `docs/audit/v2/wave4/D38.md` | `video-editor`, `video-premiere`, `voice-post-create`, `voice-recorder`, `volunteer-board` |
| D39 | `docs/audit/v2/wave4/D39.md` | `waqf`, `watch-history`, `watch-party`, `whats-new`, `why-showing` |
| D40 | `docs/audit/v2/wave4/D40.md` | `wind-down`, `xp-history`, `zakat-calculator`, `_layout` (screens) |
| D41 | `docs/audit/v2/wave4/D41.md` | Tabs: `saf.tsx`, `bakra.tsx`, `majlis.tsx`, `minbar.tsx` |
| D42 | `docs/audit/v2/wave4/D42.md` | Tabs: `risalah.tsx`, `create.tsx`, `_layout.tsx` (tabs) |

---

## AGENT PROMPT ADDITION FOR WAVE 4

Add this to the standard preamble for all D01-D42 agents:

```
## SCREEN AUDIT INSTRUCTIONS

You are auditing 5 mobile screens. For EACH screen:

1. Read the ENTIRE file — every line, every hook call, every StyleSheet property.
2. Apply ALL 46 checks from the checklist below to EVERY screen. Not just the ones that seem relevant.
3. For each CHECK that FAILS: create a finding with the exact line number where the violation occurs.
4. For checks that PASS: do NOT report them (only failures).
5. If a screen is a complete facade (UI exists but does nothing functional), that is a CRITICAL finding.
6. If a screen has hardcoded dark colors making light mode broken, that is a HIGH finding PER occurrence.

Report format — group findings BY SCREEN, not by check:

### Screen: `screen-name.tsx` (N lines)
| # | Sev | Check | Line | Finding | Impact |
|---|-----|-------|------|---------|--------|
| 1 | H | A1-Light | :45 | `backgroundColor: '#1a1a2e'` hardcoded in StyleSheet | Light mode shows dark background |
| 2 | M | B10-Haptic | :123 | `onPress` handler has no haptic feedback | No tactile response on tap |
| 3 | C | F45-Works | :89 | `onPress={() => {}}` — empty handler | Button does nothing |

### CHECKLIST (apply ALL to EVERY screen)

**A. VISUAL & LAYOUT**
A1-Light: useThemeColors() → tc.*, no hardcoded hex/colors.dark.* in styles
A2-RTL: marginStart/paddingStart/start, not Left/Right
A3-SafeArea: SafeAreaView or useSafeAreaInsets wrapping content
A4-StatusBar: Status bar contrast matches background
A5-Radius: radius.* tokens, not hardcoded borderRadius >= 6
A6-Spacing: spacing.* tokens, minimal hardcoded pixels
A7-Typography: fontSize.* tokens, no hardcoded font sizes
A8-Responsive: No Dimensions.get for layout, use flex or useWindowDimensions
A9-Scroll: Long content scrolls, keyboard doesn't overlap, no cut-off

**B. INTERACTION & FEEDBACK**
B10-Haptic: useContextualHaptic() on all interactive elements
B11-Press: Visual press state (scale/opacity) on buttons
B12-Disabled: Disabled appearance + prevented action during loading/incomplete
B13-DoubleTap: Mutation buttons can't be tapped twice rapidly
B14-Destructive: BottomSheet/Alert for delete/block/ban/unfollow, never silent single-tap
B15-Toast: showToast() after successful mutations, not silent success
B16-LongPress: Content items have long-press context menu where expected
B17-Refresh: BrandedRefreshControl on scrollable data screens
B18-Swipe: Swipe gestures where expected (delete, reply, between items)
B19-Keyboard: KeyboardAvoidingView on screens with TextInput
B20-ScrollToInput: Multi-input forms scroll to focused input above keyboard

**C. DATA & STATE**
C21-RealAPI: Data from API, not hardcoded/mock/Math.random/setTimeout
C22-Loading: Skeleton for content loading, not ActivityIndicator
C23-Error: Error state with message + retry, not blank/crash
C24-Empty: EmptyState component, not bare text or invisible
C25-Pagination: Infinite scroll or cursor pagination on lists, not load-all
C26-Optimistic: Like/follow/bookmark update immediately, revert on error
C27-StaleData: List refetches after create/delete/update mutation
C28-BackState: Back navigation preserves scroll position and form state
C29-Offline: Network failure shows error, not blank screen
C30-Concurrent: Rapid taps, fast nav, bg/fg transitions don't crash

**D. ANIMATION & POLISH**
D31-Entrance: Lists have staggered entrance animation
D32-Transition: Screen transitions smooth, not jarring instant-swap
D33-ImageLoad: ProgressiveImage with blurhash, not raw Image
D34-LayoutStability: No content jumping after load
D35-ScrollHeader: Header collapses smoothly on scroll (if applicable)
D36-MicroInteraction: Like/follow/save animations on high-traffic screens

**E. COMPONENT COMPLIANCE**
E37-ProgressiveImage: Not raw Image from expo-image
E38-Skeleton: Not ActivityIndicator for content areas
E39-EmptyState: Not bare "No items" text
E40-BottomSheet: Not RN Modal
E41-Icon: Icon component, not text emoji
E42-BrandedRefresh: Not raw RefreshControl
E43-Toast: showToast() not Alert.alert for non-destructive
E44-Haptic: useContextualHaptic not useHaptic

**F. FUNCTIONALITY**
F45-Works: Every button/toggle/slider/input DOES something real
F46-Reachable: Screen is navigable from the app (not orphaned)
```

---

## EXPECTED FINDINGS

42 agents × 5 screens × average 8-10 failed checks per screen = **1,600-2,100 findings.**

V1 found 732 with 20 agents (10 screens each, surface-level checks). V2 with 42 agents and 46 deep checks per screen should find 2-3x more.

---

## UPDATED PART 2 TOTALS

| Wave | Agents (old) | Agents (new) | Change |
|------|-------------|-------------|--------|
| 4 Screens | 20 | **42** | +22 |
| 7 Testing | 14 | 14 | — |
| 8 i18n | 6 | 6 | — |
| 10 Infrastructure | 5 | 5 | — |
| 11 Architecture | 6 | 6 | — |
| 12 Components | 4 | 4 | — |
| 13 Schema | 2 | 2 | — |
| **Total** | **57** | **79** | **+22** |

Update `AUDIT_V2_PART2.md` Wave 4 section to reference this file instead. Execution order becomes:

```
Round 1: Wave 4 Batch 1 (D01-D11) — 11 agents
Round 2: Wave 4 Batch 2 (D12-D22) — 11 agents
Round 3: Wave 4 Batch 3 (D23-D33) — 11 agents
Round 4: Wave 4 Batch 4 (D34-D42) — 9 agents
Round 5: Wave 10 (5) + Wave 13 (2) — 7 agents
Round 6: Wave 11 (6) + Wave 12 (4) — 10 agents
Round 7: Wave 7 Batch 1 (T01-T07) — 7 agents
Round 8: Wave 7 Batch 2 (T08-T14) — 7 agents
Round 9: Wave 8 (I01-I06) — 6 agents

TOTAL: 9 rounds, 79 agents, 79 files
```
