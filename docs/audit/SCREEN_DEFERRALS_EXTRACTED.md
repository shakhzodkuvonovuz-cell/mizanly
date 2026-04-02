# Screen Deferrals — Extracted & Categorized

> Extracted from 22 progress files (R4 through R4E). Deduplicated by screen+finding.
> Generated: 2026-04-02

## Category Counts

| # | Category | Unique Items |
|---|----------|-------------|
| 1 | Offline/NetInfo | 32 |
| 2 | Dimensions/Responsive | 22 |
| 3 | Backend-blocked | 30 |
| 4 | Keyboard | 14 |
| 5 | RTL | 12 |
| 6 | StatusBar | 3 |
| 7 | Optimistic updates | 14 |
| 8 | Feature not built | 14 |
| 9 | Animation/Polish | 17 |
| 10 | Schema/Architecture | 16 |
| 11 | Other | 15 |
| | **TOTAL** | **189** |

---

## 1. Offline/NetInfo — needs network detection (32 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| bakra.tsx | Offline/cached data for bakra — video content is network-dependent | I | R4-T1 #30 |
| majlis.tsx | No offline/cached data for majlis — needs feedCache pattern | I | R4-T1 #40 |
| minbar.tsx | No offline support for minbar video feed | I | R4-T1 #51 |
| risalah.tsx | Offline indicator for socket disconnect | I | R4-T1 #24 |
| bakra/majlis/minbar | Feed caching — saf's feedCache pattern needs replication | M | R4-T1 #54 |
| conversation/[id].tsx | Offline messages in React state only — requires AsyncStorage queue | C | R4-T2 #1 |
| broadcast/[id].tsx | No offline detection — requires NetInfo integration | I | R4-T3 #37 |
| camera.tsx | No offline handling — camera facade, no network ops | L | R4-T3 #92 |
| chat-export.tsx | Offline detection — cross-cutting concern | L | R4-T5 #14 |
| blocked.tsx | Offline detection requires network state utility | L | R4B-T1 #11 |
| boost-post.tsx | Offline guard before payment — requires network state utility | M | R4B-T1 #62 |
| branded-content.tsx | Offline guard requires network utility | M | R4B-T1 #80 |
| creator-storefront.tsx | Offline handling — needs netinfo cross-screen infra | M | R4B-T3 D13#15 |
| cross-post.tsx | Offline detection — needs netinfo cross-screen infra | M | R4B-T3 D13#32 |
| dhikr-counter.tsx | Offline counter persistence — needs AsyncStorage queue | M | R4B-T3 D13#76 |
| community-posts.tsx | No offline handling — needs NetInfo | M | R4B-T4 #24 |
| contact-sync.tsx | No offline indicator — needs NetInfo | M | R4B-T4 #41 |
| content-settings.tsx | No offline handling — needs NetInfo | I | R4B-T4 #84 |
| create-reel.tsx | Upload mutation no network check — requires expo-network | M | R4C-T1 D12#19 |
| create-story.tsx | No network check before upload | M | R4C-T1 D12#35 |
| create-thread.tsx | No network check for uploads | M | R4C-T1 D12#57 |
| create-video.tsx | No network check for upload | M | R4C-T1 D12#74 |
| create-clip.tsx | Offline detection — needs netinfo | I | R4C-T3 D11#7 |
| create-event.tsx | Offline detection — same cross-cutting | L | R4C-T3 D11#19 |
| create-playlist.tsx | Offline detection — same cross-cutting | L | R4C-T3 D11#42 |
| create-post.tsx | Offline detection — same cross-cutting | M | R4C-T3 D11#58 |
| membership-tiers.tsx | No offline handling — needs NetInfo listener | L | R4C-T4 D23#59 |
| orders.tsx | No offline caching strategy — needs NetInfo | M | R4C-T4 D26#6 |
| donate.tsx | Offline — NetInfo integration required across payment screens | I | R4E-T1 D15#13 |
| go-live.tsx | App-level offline detection hook not built | M | R4E-T3 D18#50 |
| saved.tsx | App-level offline detection hook not built | M | R4E-T3 D32#7 |
| scholar-verification.tsx | App-level offline detection hook not built | M | R4E-T3 D32#61 |

---

## 2. Dimensions/Responsive — module-scope Dimensions.get (22 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| bookmark-folders.tsx | SCREEN_W at module scope — useWindowDimensions adds re-render cost | I | R4B-T1 #50 |
| channel/[handle].tsx | Dimensions at module scope — used for computed constants | M | R4-T4 CN-13 |
| creator-storefront.tsx | SCREEN_WIDTH stale on resize — needs grid restructure | M | R4B-T3 D13#8 |
| dhikr-counter.tsx | COUNTER_SIZE not responsive — iPad adaptation future work | M | R4B-T3 D13#84 |
| discover.tsx | Stale Dimensions on rotation — module-level for styles | M | R4B-T3 D14#22 |
| create-reel.tsx | Dimensions.get at module scope — 20+ style references | L | R4C-T1 D12#20 |
| create-story.tsx | SCREEN_W/SCREEN_H at module scope — CANVAS_H derived | M | R4C-T1 D12#37 |
| hashtag/[tag].tsx | useWindowDimensions would cause all grid items to re-render | M | R4D-T1 D20#4 |
| story-viewer.tsx | Dimensions.get at module level — needs prop-drilling through memo'd components | C | R4D-T2 D36#17 |
| live/[id].tsx | SCREEN_WIDTH module-level needs useWindowDimensions + prop-drilling | M | R4D-T2 D21#54 |
| video-editor.tsx | screenHeight/screenWidth at module scope — 15+ usages in god component | M | R4D-T3 D38#3 |
| green-screen-editor.tsx | Dimensions at module scope — needs useWindowDimensions refactor | M | R4E-T4 D19#3 |
| green-screen-editor.tsx | Grid uses static screenWidth — coupled with Dimensions issue | L | R4E-T4 D19#13 |
| hadith.tsx | Dimensions at module scope — only affects skeleton width | L | R4E-T4 D19#26 |
| product-detail.tsx (D28) | Dimensions at module scope | M | R4E-T4 D28#3 |
| profile/[username].tsx | Dimensions at module scope | M | R4E-T4 D28#21 |
| qibla-compass.tsx | Dimensions at module scope | M | R4E-T4 D28#45 |
| ramadan-mode.tsx | Dimensions at module scope | M | R4E-T4 D30#2 |
| reel/[id].tsx | Dimensions at module scope | L | R4E-T4 D30#24 |
| reel-remix.tsx | Dimensions at module scope | L | R4E-T4 D30#35 |
| reel-templates.tsx | Dimensions at module scope | M | R4E-T4 D30#41 |
| eid-cards.tsx | Card width 47% responsive — needs dynamic width calc | M | R4B-T4 D16#25 |

---

## 3. Backend-blocked — API endpoint, pagination, or backend feature missing (30 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| chat-folder-view.tsx | No pagination on conversations — backend API change needed | M | R4-T5 #25 |
| cashout.tsx | No pagination — backend not implemented | M | R4-T4 CS-12 |
| cashout.tsx | No pull to refresh — backend not implemented | L | R4-T4 CS-13 |
| bookmark-collections.tsx | Pagination requires backend cursor support | L | R4B-T1 #27 |
| bookmark-collections.tsx | Long-press edit/delete — collections are implicit, needs API | I | R4B-T1 #30 |
| audio-library.tsx | Pagination requires backend API cursor-based listing | H | R4B-T1 D03#5 |
| boost-post.tsx | Show actual post thumbnail — needs post data fetch | L | R4B-T1 #68 |
| communities.tsx | Pagination broken — cursor never passed, major refactor | H | R4B-T2 #79 |
| creator-storefront.tsx | Products pagination — backend needs sellerId + cursor endpoint | M | R4B-T3 D13#17 |
| creator-storefront.tsx | Backend sellerId filter — cross-scope API work | M | R4B-T3 D13#21 |
| dhikr-challenge-detail.tsx | Leaderboard pagination — backend needs paginated endpoint | M | R4B-T3 D13#50 |
| starred-messages.tsx | No pagination — API endpoint doesn't support cursor | H | R4C-T1 D35#13 |
| send-tip.tsx | message field not in CreatePaymentIntentDto — backend API change needed | L | R4C-T3 D33#59 |
| series/[id].tsx | Episode pagination requires backend API endpoint change | L | R4C-T3 D33#73 |
| mentorship.tsx | No pagination on Find tab — requires useInfiniteQuery refactor | L | R4C-T4 D23#71 |
| pinned-messages.tsx | No pagination — pinned messages rarely exceed threshold | M | R4C-T4 D26#49 |
| hashtag/[tag].tsx | AsyncStorage follows → server API — needs backend endpoint | M | R4D-T1 D20#11 |
| leaderboard.tsx | Pagination beyond 50 requires backend cursor support | H | R4D-T2 D21#21 |
| islamic-calendar.tsx | ISLAMIC_EVENTS static array requires backend API | L | R4D-T2 D21#9 |
| save-to-playlist.tsx | N+1 inclusion queries — backend endpoint doesn't exist | H | R4D-T4 D31#61 |
| account-switcher.tsx | Auto-switch toggle local-only — requires API endpoint | M | R4C-T2 D01#50 |
| donate.tsx | Pagination — islamicApi.getMyDonations needs cursor param | M | R4E-T1 D15#8 |
| drafts.tsx | Pagination requires draftsApi.getAll cursor param | M | R4E-T1 D15#30 |
| dua-collection.tsx | Pagination requires islamicApi.getDuas cursor param | M | R4E-T1 D15#38 |
| watch-party.tsx | useInfiniteQuery rewrite requires API cursor pagination | H | R4E-T1 D39#22 |
| followed-topics.tsx | Pagination requires API change — hashtagsApi.getTrending no cursor | M | R4E-T3 D18#5 |
| follow-requests.tsx | useInfiniteQuery — requires API cursor verification | M | R4E-T3 D17#50 |
| manage-broadcast.tsx | Screen fetches followers not subscribers — API doesn't exist | H | R4E-T3 D22#51 |
| manage-broadcast.tsx | Both tabs showing same data — caused by missing API | H | R4E-T3 D22#52 |
| schedule-post.tsx | Backend auto-publisher worker not implemented | C | R4E-T3 D32#38 |

---

## 4. Keyboard — KAV needed in BottomSheet or complex layout (14 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| cashout.tsx | KeyboardAvoidingView — feature-gated screen, low priority | L | R4-T4 CS-11 |
| bookmark-folders.tsx | BottomSheet keyboard avoidance — depends on BottomSheet impl | M | R4B-T1 #48 |
| dhikr-challenges.tsx | TextInput in BottomSheet keyboard — library handles internally | M | R4B-T3 D13#58 |
| cross-post.tsx | TextInput hidden by keyboard — needs KAV + layout restructure | M | R4B-T3 D13#30 |
| create-video.tsx | KeyboardAvoidingView — ScrollView + KAV double-offset issues | M | R4C-T1 D12#71 |
| appeal-moderation.tsx | KeyboardAvoidingView — complex platform-specific | M | R4-T6 #75 |
| create-post.tsx | Toolbar keyboard avoidance for absolute-positioned bottom bar | M | R4C-T3 D11#54 |
| video-editor.tsx | KeyboardAvoidingView for caption — deep inside tool panel system | M | R4D-T3 D38#8 |
| waqf.tsx | KeyboardAvoidingView in BottomSheet — component-level changes | M | R4E-T1 D39#7 |
| watch-party.tsx | Keyboard avoidance in BottomSheet — component-level changes | M | R4E-T1 D39#27 |
| live/[id].tsx | Chat keyboard in BottomSheet — Gorhom handles internally | H | R4D-T2 D21#45 |
| profile-customization.tsx | KeyboardAvoidingView for music URL input | M | R4E-T4 D28#33 |
| quiet-mode.tsx | KeyboardAvoidingView for auto-reply input | L | R4E-T4 D29#16 |
| reel-remix.tsx | KeyboardAvoidingView for caption input | H | R4E-T4 D30#31 |

---

## 5. RTL — complex RTL that needs per-element decisions (12 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| conversation-info.tsx | 7+ scattered inline styles need isRTL — comprehensive RTL pass | H | R4-T2 #32 |
| creator-storefront.tsx | RTL avatar+info — centered layout, flip would look wrong | L | R4B-T3 D13#9 |
| dhikr-challenge-detail.tsx | Leaderboard RTL — centered content, flip unnecessary | L | R4B-T3 D13#49 |
| story-viewer.tsx | Full RTL layout — requires restructuring 50+ elements | H | R4D-T2 D36#16 |
| video-editor.tsx | RTL scaleX double-flip — requires RTL device testing | M | R4D-T3 D38#4 |
| green-screen-editor.tsx | RTL horizontal ScrollView — needs layout redesign for RTL chip order | L | R4E-T4 D19#2 |
| product-detail.tsx (D28) | RTL needs isRTL + rtlFlexRow on rows | M | R4E-T4 D28#2 |
| hajj-step.tsx | RTL checkItem flexDirection — needs rtlFlexRow but no isRTL available | L | R4E-T4 D19#42 |
| halal-finder.tsx | Horizontal chips FlatList RTL needs inverted prop | L | R4E-T4 D19#52 |
| quran-reading-plan.tsx | RTL needs isRTL + rtlFlexRow on plan/stats/history rows | M | R4E-T4 D29#20 |
| quran-room.tsx | RTL needs isRTL + rtlFlexRow on rows | M | R4E-T4 D29#32 |
| quran-share.tsx | RTL needs isRTL + rtlFlexRow on rows | M | R4E-T4 D29#42 |

---

## 6. StatusBar — missing StatusBar configuration (3 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| risalah.tsx | No StatusBar component — root layout manages it | L | R4-T1 #22 |
| _layout.tsx (tabs) | StatusBar management in tab layout — per-tab conflicts | L | R4-T1 #36 |
| story-viewer.tsx | StatusBar management requires lifecycle across story groups | M | R4D-T2 D36#18 |

---

## 7. Optimistic updates — needs complex rollback logic (14 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| bakra.tsx | Follow button optimistic update — cache mutation needed | M | R4-T1 #25 |
| risalah.tsx | Archive optimistic update — complex cache key management | M | R4-T1 #21 |
| bookmark-folders.tsx | Optimistic UI removal during folder delete — complex rollback | M | R4B-T1 #44 |
| close-friends.tsx | Optimistic update — requires per-user pending tracking | M | R4B-T2 #44 |
| close-friends.tsx | isPending blocks all toggles — needs per-user mutation tracking | L | R4B-T2 #45 |
| series-detail.tsx | Optimistic update for follow — cache mutation needed | M | R4B-T2 D34#5 |
| series-discover.tsx | Optimistic update — invalidation approach is simpler | M | R4B-T2 D34#16 |
| search-results.tsx | Optimistic follow needs queryClient.setQueryData cache rollback | L | R4C-T3 D33#39 |
| notifications.tsx | Read mutation flicker — optimistic update needs infinite query cache refactor | M | R4C-T2 D25#69 |
| morning-briefing.tsx | Optimistic task completion needs queryClient.setQueryData refactor | M | R4D-T4 D24#10 |
| followers/[userId].tsx | Optimistic update on InfiniteQuery paginated data — complex | M | R4E-T3 D18#17 |
| following/[userId].tsx | Same as followers — optimistic update on InfiniteQuery | M | R4E-T3 D18#27 |
| reel/[id].tsx | Bookmark optimistic updates | M | R4E-T4 D30#19 |
| majlis-lists.tsx | Optimistic create — needs temp ID client-side | L | R4E-T3 D22#40 |

---

## 8. Feature not built — core feature is a facade/stub (14 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| caption-editor.tsx | Play/pause decorative only — no video player integrated yet | I | R4-T4 CE-32 |
| image-editor.tsx | Non-functional sliders — needs gesture handler integration | H | R4D-T1 D20#35 |
| image-editor.tsx | Image editor save/export — needs expo-image-manipulator | H | R4D-T1 D20#36 |
| verify-encryption.tsx | Fingerprint fetching stubbed — requires signal/ module wiring | C | R4D-T3 D37#37 |
| voice-recorder.tsx | Uploaded audio not attached to content — architecture gap | M | R4D-T3 D38#53 |
| green-screen-editor.tsx | IMAGE/VIDEO_BACKGROUNDS have no URIs — needs vision camera | M | R4E-T4 D19#8 |
| green-screen-editor.tsx | Apply button doesn't pass selections — coupled with non-functional feature | I | R4E-T4 D19#14 |
| green-screen-editor.tsx | Entire green screen feature non-functional — needs vision camera | H | R4E-T4 D19#15 |
| go-live.tsx | DateTimePicker component not installed (expo-date-time-picker) | H | R4E-T3 D18#47 |
| schedule-live.tsx | Backend API endpoint verification needed | H | R4E-T3 D32#34 |
| schedule-post.tsx | Status bar config needs expo-status-bar — requires device testing | H | R4E-T3 D32#48 |
| disposable-camera.tsx | Backend disposable sticker type — cross-scope API | L | R4B-T3 D14#40 |
| location-picker.tsx | Displaying actual map requires react-native-maps (not installed) | M | R4E-T2 D22#10 |
| quran-reading-plan.tsx | ProgressRing is visual decoration — needs SVG refactor | H | R4E-T4 D29#28 |

---

## 9. Animation/Polish — entrance animations, layout shifts, stagger caps (17 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| saf.tsx | FadeIn on scroll items — detecting first-load vs scroll adds complexity | I | R4-T1 #14 |
| broadcast-channels.tsx | FadeInUp re-animation on scroll-back — Reanimated limitation | I | R4-T3 #14 |
| call-history.tsx | FadeInUp re-animation — Reanimated limitation | I | R4-T3 #50 |
| call/[id].tsx | Video grid no layout animation — LayoutAnimation + Reanimated issues | I | R4-T3 #69 |
| camera.tsx | Mode selector no animation — cosmetic, low priority | I | R4-T3 #93 |
| caption-editor.tsx | Entrance crossfade polish — low impact | L | R4-T4 CE-29 |
| challenges.tsx | Animation jank cap — already mitigated at 600ms | L | R4-T4 CH-11 |
| channel/[handle].tsx | Inconsistent entrance animation — polish | L | R4-T4 CN-27 |
| channel/[handle].tsx | Layout shift on load — intentional floating avatar | L | R4-T4 CN-28 |
| analytics.tsx | Long-press context menu on charts — enhancement | L | R4-T6 #49 |
| analytics.tsx | Period toggle animation — polish | L | R4-T6 #51 |
| analytics.tsx | RTL border radius — negligible impact | L | R4-T6 #52 |
| archive.tsx | Animation cap at 15 — acceptable optimization | L | R4-T6 #95 |
| disappearing-settings.tsx | No animated selection transition — visual polish | I | R4B-T3 D14#15 |
| notifications.tsx | Follow-back micro-interaction — Reanimated spring + mutation state | L | R4C-T2 D25#71 |
| notifications.tsx | Opacity dims everything — requires Pressable children restructuring | M | R4C-T2 D25#74 |
| duet-create.tsx | Animated recording dot pulse — requires Reanimated shared value | I | R4E-T1 D15#58 |

---

## 10. Schema/Architecture — needs Prisma schema change or major refactor (16 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| saf/bakra/majlis/minbar | Systemic theme pattern — StyleSheet dark + inline tc override | L | R4-T1 #56 |
| conversation/[id].tsx | Offline messages — requires AsyncStorage queue architecture | C | R4-T2 #1 |
| broadcast/[id].tsx | Offline messages — requires offline queue architecture | I | R4-T2 #60 |
| blocked.tsx | Cross-screen query invalidation — architectural concern | L | R4B-T1 #15 |
| branded-content.tsx | Cross-screen query invalidation — architectural concern | L | R4B-T1 #79 |
| communities.tsx | Manual state instead of useQuery — major refactor | M | R4B-T2 #78 |
| communities.tsx | State lost on navigation — needs global state | L | R4B-T2 #82 |
| communities.tsx | Fragile category matching — backend returns English strings | L | R4B-T2 #88 |
| followed-topics.tsx | React Query migration — entire screen needs rewrite | M | R4E-T3 D18#6 |
| creator-dashboard.tsx | loadData doesn't use useQuery — restructuring 4 parallel API calls | M | R4C-T1 D12#93 |
| post-insights.tsx | Converting manual fetch to useQuery — large refactor | L | R4D-T1 D27#38 |
| revenue.tsx | Migrating from manual useState to useQuery — refactoring data flow | M | R4D-T4 D31#36 |
| revenue.tsx | Offline UX requires react-query migration first | L | R4D-T4 D31#37 |
| save-to-playlist.tsx | ScreenErrorBoundary wrapping — component structure change | M | R4D-T4 D31#59 |
| share-profile.tsx | ScreenErrorBoundary doesn't wrap early returns — structural refactor | H | R4B-T2 D34#41 |
| create-group.tsx | Orphaned R2 uploads — requires server-side cleanup | M | R4C-T3 D11#32 |

---

## 11. Other — miscellaneous deferrals (15 items)

| Screen | Finding | Sev | Source |
|--------|---------|-----|--------|
| majlis.tsx | Scroll restoration 100ms setTimeout — adaptive measurement non-trivial | M | R4-T1 #37 |
| bakra.tsx | renderItem 14 dependencies — acceptable for FlashList recycling | M | R4-T1 #26 |
| minbar.tsx | listHeader 7 dependencies — splitting adds complexity | M | R4-T1 #47 |
| channel/[handle].tsx | Channel avatar no press feedback — small secondary target | L | R4-T4 CN-15 |
| channel/[handle].tsx | Featured is arbitrary — design decision | I | R4-T4 CN-30 |
| channel/[handle].tsx | featuredBadgeText hardcoded color — intentional contrast on gold | L | R4-T4 CN-31 |
| charity-campaign.tsx | Currency not locale-aware — needs deeper i18n system | I | R4-T4 CC-14 |
| chat-theme-picker.tsx | Dynamic bottom spacer — needs useSafeAreaInsets integration | L | R4-T5 #101 |
| chat-export.tsx | Stats retry mechanism — needs pull-to-refresh ScrollView refactor | L | R4-T5 #13 |
| ai-assistant.tsx | BrandedRefreshControl — generates on demand, not fetch screen | M | R4-T6 #16 |
| appeal-moderation.tsx | Scroll-to-input on focus — enhancement | L | R4-T6 #76 |
| appeal-moderation.tsx | Document upload coming soon — placeholder feature | L | R4-T6 #82 |
| 2fa-setup/verify.tsx | OTP boxes overflow narrow screens — standard fixed-width pattern | M | R4C-T2 D01#6/#29 |
| storage-management.tsx | MAX_STORAGE_BYTES — getFreeDiskStorageAsync not reliable cross-platform | M | R4D-T2 D36#5 |
| prayer-times.tsx | fetchData race condition — needs AbortController refactor | M | R4D-T1 D27#51 |

---

## Counts by Severity (across all categories)

| Severity | Count |
|----------|-------|
| Critical (C) | 4 |
| High (H) | 18 |
| Medium (M) | 99 |
| Low (L) | 51 |
| Info (I) | 17 |
| **Total** | **189** |

---

## Top Actionable Batches (things that can be fixed in bulk)

### Batch 1: Install `@react-native-community/netinfo` and create `useNetworkStatus()` hook
- Unblocks: **32 offline/NetInfo deferrals** across all screens
- Effort: 1 session (hook + wiring to 30+ screens)

### Batch 2: Replace module-scope `Dimensions.get()` with `useWindowDimensions()`
- Unblocks: **22 Dimensions/Responsive deferrals**
- Effort: 1-2 sessions (mechanical refactoring, some need grid restructure)

### Batch 3: RTL comprehensive pass
- Unblocks: **12 RTL deferrals** (some complex like story-viewer with 50+ elements)
- Effort: 1 session for simple ones, 1 more for story-viewer/video-editor

### Batch 4: KeyboardAvoidingView wiring
- Unblocks: **14 Keyboard deferrals**
- Effort: 1 session (mostly wrapping ScrollViews, some BottomSheet-level)

### Batch 5: Backend pagination endpoints
- Unblocks: **~15 of the 30 backend-blocked deferrals** (those that just need cursor params)
- Effort: 2 sessions (API + frontend infinite scroll wiring)

### Batch 6: Optimistic update pattern library
- Unblocks: **14 optimistic update deferrals**
- Effort: 1-2 sessions (create shared pattern, apply to follow/like/bookmark mutations)
