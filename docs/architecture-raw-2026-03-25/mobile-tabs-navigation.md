# Mobile Tab Screens & Navigation Architecture

> Extracted 2026-03-25 by architecture agent. Covers root layout, tab bar, all 5 tab screens, auth/screens/onboarding layouts, index redirect, and deep linking.

---

## File Inventory & Line Counts

| File | Lines | Role |
|------|-------|------|
| `app/_layout.tsx` | 521 | Root layout — providers, auth guard, overlays |
| `app/(tabs)/_layout.tsx` | 201 | Tab bar configuration — 5 visible tabs + 1 hidden |
| `app/(tabs)/saf.tsx` | 841 | Saf (home feed) — Instagram-model |
| `app/(tabs)/bakra.tsx` | 1,223 | Bakra (short video) — TikTok-model |
| `app/(tabs)/minbar.tsx` | 711 | Minbar (long video) — YouTube-model |
| `app/(tabs)/majlis.tsx` | 537 | Majlis (threads) — X/Twitter-model |
| `app/(tabs)/risalah.tsx` | 618 | Risalah (messaging) — WhatsApp-model |
| `app/(tabs)/create.tsx` | 16 | Redirect stub — deep-link safety |
| `app/(auth)/_layout.tsx` | 11 | Auth stack — sign-in, sign-up, forgot-password |
| `app/(screens)/_layout.tsx` | 15 | Screens stack — slide_from_right animation |
| `app/onboarding/_layout.tsx` | 12 | Onboarding stack — gestures disabled |
| `app/index.tsx` | 10 | Entry point — redirects to `/(tabs)/saf` |
| **Total** | **4,716** | |

---

## 1. Root Layout (`app/_layout.tsx`) — 521 lines

### Imports (40 imports)

**React / React Native:**
- `useEffect`, `useState`, `useCallback` from react
- `I18nManager`, `AppState`, `AppStateStatus`, `Platform`, `View`, `Text`, `StyleSheet`, `TextInput` from react-native

**Expo Router:**
- `Stack`, `useRouter`, `useSegments`, `useRootNavigationState` from expo-router

**Expo Packages:**
- `StatusBar` from expo-status-bar
- `useFonts` from expo-font
- `PlayfairDisplay_700Bold` from @expo-google-fonts/playfair-display
- `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_700Bold` from @expo-google-fonts/dm-sans
- `NotoNaskhArabic_400Regular`, `NotoNaskhArabic_700Bold` from @expo-google-fonts/noto-naskh-arabic
- `Linking` from expo-linking
- `StoreReview` from expo-store-review
- `Constants` from expo-constants
- `SecureStore` from expo-secure-store
- `SplashScreen` from expo-splash-screen
- `LocalAuthentication` from expo-local-authentication

**Third-party:**
- `ClerkProvider`, `ClerkLoaded`, `useAuth`, `useUser` from @clerk/clerk-expo
- `QueryClient`, `QueryClientProvider`, `useQueryClient`, `focusManager` from @tanstack/react-query
- `GestureHandlerRootView` from react-native-gesture-handler
- `AsyncStorage` from @react-native-async-storage/async-storage
- `i18next` from @/i18n

**Internal Services:**
- `setupDeepLinkListeners` from @/utils/deepLinking
- `api` from @/services/api
- `initGiphy` from @/services/giphyService
- `widgetData` from @/services/widgetData
- `initSentry`, `setSentryUser` from @/config/sentry
- `navigate` from @/utils/navigation

**Internal Hooks:**
- `usePushNotifications` from @/hooks/usePushNotifications
- `useNetworkStatus` from @/hooks/useNetworkStatus
- `useTranslation` from @/hooks/useTranslation
- `useIslamicTheme`, `useIsEidToday` from @/hooks/useIslamicTheme
- `useThemeColors` from @/hooks/useThemeColors

**Internal Components:**
- `ErrorBoundary` from @/components/ErrorBoundary
- `OfflineBanner` from @/components/ui/OfflineBanner
- `Icon` from @/components/ui/Icon
- `GradientButton` from @/components/ui/GradientButton
- `ForceUpdateModal` from @/components/ui/ForceUpdateModal
- `MiniPlayer` from @/components/ui/MiniPlayer
- `TTSMiniPlayer` from @/components/ui/TTSMiniPlayer
- `ToastContainer`, `showToast` from @/components/ui/Toast
- `useStore` from @/store
- `colors`, `fontSizeExt` from @/theme

### Provider/Wrapper Hierarchy (outermost → innermost)

```
GestureHandlerRootView (flex: 1)
  ErrorBoundary
    ClerkProvider (publishableKey, tokenCache)
      ClerkLoaded
        QueryClientProvider (client=queryClient)
          ├── ThemeAwareStatusBar
          ├── OfflineBanner
          ├── IslamicThemeBanner
          ├── AuthGuard
          ├── AppStateHandler
          ├── ShareIntentHandler
          ├── DeepLinkHandler
          ├── BiometricLockOverlay
          ├── EidCelebrationOverlay
          ├── ForceUpdateModal
          ├── Stack (headerShown: false)
          │   ├── Stack.Screen name="(tabs)"
          │   ├── Stack.Screen name="(auth)" presentation="modal"
          │   ├── Stack.Screen name="onboarding" gestureEnabled: false
          │   └── Stack.Screen name="(screens)"
          ├── MiniPlayer
          ├── TTSMiniPlayer
          └── ToastContainer
```

### RTL Configuration (module-level)
- `I18nManager.allowRTL(true)` — allows OS RTL flip
- RTL languages: `['ar', 'ur']`
- Forces RTL if current i18next language is in list and `I18nManager.isRTL` differs
- **Font scaling cap:** `Text.defaultProps.maxFontSizeMultiplier = 1.5` and `TextInput.defaultProps.maxFontSizeMultiplier = 1.5`

### Sentry Initialization
- `initSentry()` called at module scope (before component mount)
- `setSentryUser(userId, username)` called inside AuthGuard when user signs in

### React Query Configuration
- `staleTime`: 5 minutes
- `gcTime`: 10 minutes
- `refetchOnWindowFocus`: true (wired to AppState 'active' via focusManager)
- `retry`: 3 with exponential backoff (1s, 2s, 4s... max 30s)
- Mutations: show toast on error, retry network errors up to 3 times

### Token Cache
- **iOS/Android:** `expo-secure-store` (getItemAsync/setItemAsync)
- **Web:** `localStorage` (getItem/setItem)

### AuthGuard Component
1. Wires Clerk token into `api.setTokenGetter()` and `api.setForceRefreshTokenGetter()`
2. Sets `api.setSessionExpiredHandler()` to redirect to sign-in
3. Registers push notifications via `usePushNotifications(!!isSignedIn)`
4. Sets Sentry user context
5. Initializes GIPHY SDK via `initGiphy()`
6. **Navigation logic:**
   - If **not signed in**: Only redirects to auth if currently in onboarding. Allows anonymous browsing of feed tabs.
   - If **signed in, onboarding incomplete** (`!user.unsafeMetadata.onboardingComplete`): Redirects to `/onboarding/username`
   - If **signed in, onboarding complete, but in auth/onboarding screens**: Redirects to `/(tabs)/saf`

### AppStateHandler Component
- On app foreground: invalidates stale queries, syncs widget data (unread counts, user info)

### BiometricLockOverlay Component
- Reads `biometricLockEnabled` from Zustand store
- On app foreground + biometric enabled: prompts `LocalAuthentication.authenticateAsync()`
- Shows overlay with lock icon + GradientButton to retry auth
- Z-index: 9999

### EidCelebrationOverlay Component
- Uses `useIsEidToday()` hook
- Checks AsyncStorage `lastEidCelebrationDate` to avoid repeat shows per day
- Shows heart icon + "Eid Mubarak" text for 3 seconds
- Z-index: 10000

### ForceUpdateModal
- Fetches `/health/config` from API base URL
- Compares `config.minAppVersion` against `Constants.expoConfig.version` using semver compare
- Shows modal if current version < required version

### NSFW Model Pre-load
- `require('@/services/nsfwCheck').initNSFWModel()` called in useEffect
- Non-blocking, silent failure if packages not installed

### App Rating Prompt
- Tracks session count in `AsyncStorage` key `app_sessions`
- After 7+ sessions: calls `StoreReview.requestReview()` (once, tracked by `rating_asked` key)

### Network Status
- `useNetworkStatus()` called at root level (registers network listeners)

### Overlay Components (render order)
1. **ThemeAwareStatusBar** — StatusBar style follows dark/light theme
2. **OfflineBanner** — Shows banner when offline
3. **IslamicThemeBanner** — Eid/Ramadan colored banner
4. **BiometricLockOverlay** — Full-screen lock (z-index 9999)
5. **EidCelebrationOverlay** — Full-screen celebration (z-index 10000)
6. **ForceUpdateModal** — Blocks app if version too old
7. **MiniPlayer** — Persistent audio mini player (below stack)
8. **TTSMiniPlayer** — Text-to-speech mini player (below stack)
9. **ToastContainer** — Toast notifications

---

## 2. Tab Bar Layout (`app/(tabs)/_layout.tsx`) — 201 lines

### Imports
- `Tabs`, `useRouter` from expo-router
- `View`, `Text`, `Pressable`, `StyleSheet`, `Platform` from react-native
- `Animated`, `useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming` from react-native-reanimated
- `BlurView` from expo-blur
- `Icon` from @/components/ui/Icon
- `Badge` from @/components/ui/Badge
- `WebLayout` from @/components/web/WebLayout
- `useContextualHaptic` from @/hooks/useContextualHaptic
- `useResponsive` from @/hooks/useResponsive
- `useWebKeyboardShortcuts` from @/hooks/useWebKeyboardShortcuts
- `useThemeColors` from @/hooks/useThemeColors
- `colors`, `tabBar`, `spacing`, `fontSize`, `animation`, `radius`, `fontSizeExt` from @/theme
- `useStore` from @/store
- `navigate` from @/utils/navigation

### Tab Configuration (5 visible + 1 hidden)

| Tab | Name | Icon | Badge Source | Accessibility Label |
|-----|------|------|-------------|-------------------|
| 1 | `saf` | `home` | `unreadNotifications` from store | `tabs.accessibility.homeFeed` |
| 2 | `bakra` | `play` | none | `tabs.accessibility.shortVideos` |
| 3 | `minbar` | `video` | none | `tabs.accessibility.videos` |
| 4 | `majlis` | `message-circle` | none | `tabs.accessibility.threads` |
| 5 | `risalah` | `mail` | `unreadMessages` from store | `tabs.accessibility.messages` |
| hidden | `create` | — | — | `href: null` prevents tab display |

### Tab Bar Styling
- **Position:** absolute
- **Height:** `tabBar.height` from theme
- **Border top:** `StyleSheet.hairlineWidth`, `rgba(255,255,255,0.08)`
- **iOS background:** `BlurView` (intensity 80, tint dark)
- **Android background:** `rgba(13, 17, 23, 0.92)` solid
- **Web (desktop/tablet):** Tab bar hidden (`display: 'none'`, height 0), uses `WebLayout` side nav instead
- **Labels:** hidden (`tabBarShowLabel: false`)
- **Active color:** `colors.emerald`
- **Inactive color:** `tc.text.secondary` from theme

### TabIcon Component (animated)
- **Scale animation:** active tab icon scales to 1.1x with spring (responsive config)
- **Active pill:** 48x48 circle with `colors.active.emerald10` background, fades in/out with timing (200ms)
- **Badge:** positioned absolute top-4, end-0

### Platform-Specific Behavior
- **Web (wide):** `isDesktop || isTablet` — hides tab bar, uses `WebLayout` wrapper
- **All tabs:** haptic `tick()` on tab press via listeners

---

## 3. Saf Screen (`app/(tabs)/saf.tsx`) — 841 lines

### Role
Instagram-model home feed. Stories row + Following/For You feed tabs + suggested users.

### Imports (50+ imports)
**React:** useCallback, useEffect, useRef, useState, useMemo, memo
**React Native:** View, Text, StyleSheet, Pressable
**FlashList:** FlashList, FlashListRef from @shopify/flash-list
**Navigation:** useScrollToTop, useFocusEffect from @react-navigation/native
**React Query:** useInfiniteQuery, useQuery, useMutation, useQueryClient
**Auth:** useUser from @clerk/clerk-expo
**Router:** useRouter from expo-router
**Reanimated:** useSharedValue, useAnimatedStyle, useAnimatedReaction, runOnJS, withSpring, FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutUp, SlideOutRight
**Theme:** colors, spacing, fontSize, radius, animation, fonts, tabBar, lineHeight, letterSpacing

### Key Components
- `SuggestedUserCard` — Shows suggested users inline in feed (every 8 posts)
- `SuggestedUserRow` (memo) — Individual suggested user with follow/dismiss actions, SlideOutRight exit anim
- `ExploreFirstBanner` — Dismissable banner for new users, FadeIn/FadeOut
- `PostCard` — Main post rendering (imported from @/components/saf/PostCard)
- `StoryRow` — Horizontal story circles (imported from @/components/saf/StoryRow)
- `CreateHeaderButton` — Emerald gradient "+" button (imported from @/components/ui/CreateSheet)

### API Queries
| Query Key | API Call | Config |
|-----------|---------|--------|
| `['saf-feed', feedType]` | `postsApi.getFeed(feedType, cursor)` | Infinite, cursor-based pagination |
| `['stories-feed']` | `storiesApi.getFeed()` | Single query |
| `['notifications-count']` | `notificationsApi.getUnreadCount()` | `refetchInterval: 60_000`, only when user exists |
| `['feed-suggested-users']` | `feedApi.getSuggestedUsers(5)` | `staleTime: 5 min` |
| `['saf-new-posts-check', feedType]` | `postsApi.getFeed(feedType, undefined)` | `refetchInterval: 30_000` when scrolled down |

### Mutations
| Mutation | API Call | Invalidates |
|----------|---------|-------------|
| follow | `followsApi.follow(userId)` | `['feed-suggested-users']`, `['saf-feed']` |

### State Management
- `feedType`: from Zustand store (`safFeedType`: 'following' | 'foryou')
- `refreshing`: local useState
- `bannerDismissed`: AsyncStorage `mizanly:explore_banner_dismissed`
- `dismissedUserIds`: local Set<string>
- `hasScrolledDown`: tracked via useAnimatedReaction on scrollY (>200 = true, <50 = false)
- `newPostsAvailable`: compared latest server post ID vs current top of feed

### FlatList Configuration (FlashList)
- `estimatedItemSize`: 400
- `windowSize`: 7
- `maxToRenderPerBatch`: 5
- `onEndReachedThreshold`: 0.4
- `scrollEventThrottle`: 16
- `contentContainerStyle`: paddingBottom = tabBar.height + spacing.base
- `refreshControl`: BrandedRefreshControl
- `getItemType`: distinguishes 'suggested' vs 'post' for FlashList recycling

### Key Features
1. **Story Row** with tap-to-view and tap-own-to-create logic
2. **Feed type tabs** (Following / For You) with TabSelector pill variant + spring animation on switch
3. **Suggested users** interleaved every 8 posts, dismissable per-user
4. **"New posts" banner** — emerald pill that appears when new posts arrive while scrolled down, scrolls to top on tap
5. **Scroll-linked header** — collapses on scroll down, reveals on scroll up (useScrollLinkedHeader)
6. **Scroll position persistence** across tab switches (saved to Zustand store, restored on useFocusEffect)
7. **Feed caching** — first page cached via feedCache for stale-while-revalidate / offline
8. **Notifications badge** on bell icon with shake animation when count goes from 0 to positive
9. **Hijri date** displayed below "Mizanly" logo
10. **Comment preview** link below posts with comment count

### Header Actions
- CreateHeaderButton (emerald "+" button)
- Search (navigates to `/(screens)/search`)
- Notifications bell with badge (navigates to `/(screens)/notifications`)
- Profile avatar (navigates to `/(screens)/profile/{username}` or settings)

### Navigation Patterns
- Story tap → `/(screens)/story-viewer` (with store data for groups + startIndex)
- Own story tap → story-viewer if stories exist, else `/(screens)/create-story`
- Post comment tap → `/(screens)/post/{id}`
- Suggested user tap → `/(screens)/profile/{username}`
- Empty feed action → `/(screens)/discover`

---

## 4. Bakra Screen (`app/(tabs)/bakra.tsx`) — 1,223 lines

### Role
TikTok-model full-screen vertical short video feed with snap scrolling.

### Imports (54 imports)
**React:** useCallback, useEffect, useRef, useState, memo, useMemo
**React Native:** View, Text, StyleSheet, Pressable, useWindowDimensions, ViewToken
**FlashList:** FlashList, FlashListRef from @shopify/flash-list
**Navigation:** useScrollToTop, useFocusEffect from @react-navigation/native
**Video:** Video, ResizeMode, AVPlaybackStatus from expo-av
**Gestures:** Gesture, GestureDetector, TapGesture from react-native-gesture-handler
**Reanimated:** useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, withSequence, Easing, runOnJS, FadeIn, FadeOut
**Clipboard:** expo-clipboard
**Other:** LinearGradient from expo-linear-gradient, ProgressiveImage, ImageCarousel, FloatingHearts, CommentsSheet, BottomSheet, formatDistanceToNowStrict, useVideoPreloader

### Key Components
- `ActionButton` — Animated wrapper for right-side action buttons (scale bounce on press)
- `ReelItem` (memo) — Full-screen reel with video, gradients, user info, caption, action column. 498 lines.

### API Queries
| Query Key | API Call | Config |
|-----------|---------|--------|
| `['reels-feed', bakraFeedType]` | `reelsApi.getFeed(cursor)` | Infinite, falls back to `reelsApi.getTrending()` if first page empty |

### Mutations/Actions (all callback-based, no useMutation)
| Action | API Call | Optimistic Update |
|--------|---------|-------------------|
| Like | `reelsApi.like/unlike(id)` | Yes — toggles isLiked + likesCount in query cache |
| Bookmark | `reelsApi.bookmark/unbookmark(id)` | Yes — toggles isBookmarked in query cache |
| Share | `reelsApi.share(id)` | No — refetches |
| View tracking | `reelsApi.view(id)` | Fire-and-forget, once per reel per session |
| Not interested | `feedApi.reportNotInterested(id, 'reel')` | Toast feedback |
| Copy link | `reelsApi.getShareLink(id)` + Clipboard | Fallback URL construction |
| Follow | `followsApi.follow(userId)` | Invalidates feed cache |

### State Management
- `bakraFeedType`: local state ('foryou' | 'following')
- `currentIndex`: both useState and useRef (currentIndexRef for FlashList callback stability)
- `commentsReel`: Reel | null (opens CommentsSheet)
- `heartTrigger`: incremented on double-tap (triggers FloatingHearts)
- `videoRefs`: Map of reel ID to Video ref for play/pause control
- `viewedReelIds`: Set tracking which reels have been viewed (prevents duplicate view API calls)

### FlatList Configuration (FlashList)
- `estimatedItemSize`: SCREEN_H (full screen height)
- `windowSize`: 7
- `maxToRenderPerBatch`: 5
- `snapToInterval`: SCREEN_H (full-screen snap scrolling)
- `snapToAlignment`: "start"
- `decelerationRate`: "fast"
- `viewabilityConfig`: `{ itemVisiblePercentThreshold: 80 }`
- `onViewableItemsChanged`: custom handler for video play/pause + view tracking + preloading

### Key Features
1. **Full-screen vertical snap scrolling** — TikTok-style one-reel-at-a-time
2. **Feed type tabs** (Following / For You) — absolute overlay on video, top center
3. **Video playback management** — pauses previous, plays new on viewable change, auto-loop
4. **Tap-to-pause** — single tap pauses/resumes, with pause icon overlay (FadeIn/FadeOut)
5. **Double-tap to like** — triggers FloatingHearts animation + optimistic like
6. **Photo carousel support** — `item.isPhotoCarousel` renders ImageCarousel instead of Video
7. **Video preloading** — `useVideoPreloader(3)` prefetches next 2-3 videos
8. **Progress bar** — thin emerald bar at top of video
9. **Audio marquee** — horizontal scrolling audio title text (8s repeat)
10. **Spinning audio disc** — rotating avatar/cover art (4s rotation cycle)
11. **Trending sound badge** — shows "Trending" indicator if audio is trending
12. **Right action column** — Like, Comment, Share, Duet, Stitch, Bookmark, More
13. **Duet/Stitch buttons** — navigate to create-reel with duetWith/stitchFrom params
14. **Caption expand** — 3-line truncation with "more" to expand
15. **More menu** — BottomSheet with Not Interested, Report, Copy Link, Save to Collection
16. **Scroll position persistence** — saves currentIndex * SCREEN_H to Zustand store
17. **Side panel shortcuts** — Live (red globe) and Series (gold layers) pills below feed type tabs
18. **Follow button overlay** — on creator avatar, emerald gradient plus or check icon

### Header Actions (absolute overlay)
- Search → `/(screens)/search`
- Trending audio → `/(screens)/trending-audio`
- Create reel → `/(screens)/create-reel`

### Gradients
- Bottom gradient: `transparent → 0.2 → 0.6 → 0.85` black (height 300)
- Top gradient: `0.5 → 0.2 → transparent` black (height 200)

---

## 5. Minbar Screen (`app/(tabs)/minbar.tsx`) — 711 lines

### Role
YouTube-model long video feed with category chips, continue watching, and video cards.

### Imports (34 imports)
**React:** useCallback, useEffect, useRef, useState, useMemo, memo
**React Native:** View, Text, StyleSheet, Pressable, ScrollView, Dimensions
**FlashList, Reanimated, LinearGradient, ProgressiveImage, Avatar, Icon, TabSelector, Badge, Skeleton, EmptyState, BottomSheet, BottomSheetItem, useContextualHaptic, useAnimatedPress, useScrollLinkedHeader, formatCount, formatDistanceToNowStrict, getDateFnsLocale, BrandedRefreshControl**

### Key Components
- `CategoryChip` (memo) — Category filter chip with animated press
- `VideoCard` (memo) — YouTube-style video card: thumbnail with duration badge, watch progress bar, channel avatar, title, stats, more button

### API Queries
| Query Key | API Call | Config |
|-----------|---------|--------|
| `['videos-feed', selectedCategory, feedType]` | `videosApi.getFeed(category, cursor)` | Infinite, subscriptions mode passes 'subscriptions' as category |
| `['watch-history']` | `usersApi.getWatchHistory()` | Select: filter incomplete, limit 10 |

### State Management
- `selectedCategory`: 'all' | 'QURAN' | 'EDUCATION' | 'VLOG' | 'TECH' | 'ENTERTAINMENT'
- `feedType`: 'home' | 'subscriptions'
- `selectedVideoId`: string | null (for BottomSheet more menu)

### FlatList Configuration (FlashList)
- `estimatedItemSize`: 350
- `windowSize`: 7
- `maxToRenderPerBatch`: 5
- `onEndReachedThreshold`: 0.4
- `scrollEventThrottle`: 16

### Key Features
1. **Continue Watching section** — horizontal ScrollView of in-progress videos with progress bars
2. **Feed type toggle** — Home / Subscriptions (TabSelector pill)
3. **Category chips** — horizontal ScrollView, 6 categories (All, Quran, Education, Vlog, Tech, Entertainment)
4. **Video thumbnails** — 16:9 aspect ratio, duration badge (emerald), gradient overlay
5. **Watch progress bar** — thin bar at bottom of thumbnail for partially watched videos
6. **Channel info row** — avatar, channel name with globe icon, view count + time ago
7. **More menu** — BottomSheet with Report, Save to Watch Later, Not Interested
8. **Scroll-linked header** — collapses on scroll
9. **Empty states** — different for subscriptions (no videos from channels) vs home (no videos yet)

### Header Actions
- Search → `/(screens)/search`
- Watch history/later → `/(screens)/watch-history`
- Notifications bell with badge → `/(screens)/notifications`

### Navigation Patterns
- Video tap → `/(screens)/video/{id}`
- Channel tap → `/(screens)/channel/{handle}`
- Continue watching tap → `/(screens)/video/{id}`
- Upload action → `/(screens)/create-video`

---

## 6. Majlis Screen (`app/(tabs)/majlis.tsx`) — 537 lines

### Role
X/Twitter-model thread feed with trending hashtags and floating compose button.

### Imports (37 imports)
**React:** useCallback, useEffect, useRef, useState, useMemo, memo
**Reanimated:** useSharedValue, useAnimatedStyle, useAnimatedReaction, runOnJS, withSpring, withSequence, withTiming, FadeInUp, FadeInDown, FadeOutUp
**LinearGradient** from expo-linear-gradient

### Key Components
- `AnimatedThreadCard` (memo) — ThreadCard wrapper with staggered entrance animation (translateY + opacity, 50ms stagger max 300ms) and engagement glow (gold start border for threads with >50 likes or >20 replies)
- `ThreadCard` — Imported from @/components/majlis/ThreadCard

### API Queries
| Query Key | API Call | Config |
|-----------|---------|--------|
| `['majlis-feed', feedType]` | `threadsApi.getFeed(feedType, cursor)` | Infinite |
| `['trending-hashtags']` | `hashtagsApi.getTrending()` | Single query |
| `['majlis-new-posts-check', feedType]` | `threadsApi.getFeed(feedType, undefined)` | `refetchInterval: 30_000` when scrolled down |

### State Management
- `feedType`: from Zustand store (`majlisFeedType`: 'foryou' | 'following' | 'trending' | 'video')
- `hasScrolledDown` / `newPostsAvailable`: same pattern as Saf for "new posts" banner
- `feedOpacity`: animation value for feed transition on tab change (fade out 75ms → fade in 75ms)

### Feed Tabs
4 tabs: For You, Following, Trending, Video
- Video tab applies client-side filter: `thread.mediaTypes?.some(mt => mt.startsWith('video'))`

### FlatList Configuration (FlashList)
- `estimatedItemSize`: 200
- `windowSize`: 7
- `maxToRenderPerBatch`: 5
- Wrapped in `Animated.View` with feedAnimStyle for tab switch fade

### Key Features
1. **Trending hashtags** — horizontal ScrollView of hashtag chips (emerald text), gold "trending" header with trending-up icon
2. **"New posts" banner** — same pattern as Saf (emerald pill, FadeInDown/FadeOutUp)
3. **Floating compose button (FAB)** — emerald gradient circle (56x56), pencil icon, spring bounce on press (0.85 → 1), shadow glow
4. **Scroll-linked header** — collapses on scroll
5. **Scroll position persistence** — saved to Zustand store
6. **Feed transition animation** — opacity fade (75ms) when switching feed type
7. **Caught-up indicator** — end-of-feed message with check-circle icon
8. **Engagement glow** — threads with high engagement get gold border on start side (RTL-aware)

### Header Actions
- Audio rooms → `/(screens)/audio-room` (mic icon)
- Majlis lists → `/(screens)/majlis-lists` (layers icon)
- Search → `/(screens)/search`

### Navigation Patterns
- FAB → `/(screens)/create-thread`
- Hashtag tap → `/(screens)/hashtag/{name}`
- Empty feed action → `/(screens)/create-thread`

---

## 7. Risalah Screen (`app/(tabs)/risalah.tsx`) — 618 lines

### Role
WhatsApp-model messaging screen with conversation list, real-time Socket.io, typing indicators, and swipe-to-archive.

### Imports (37 imports)
**React Native:** View, Text, FlatList, StyleSheet, Pressable
**Gestures:** Swipeable from react-native-gesture-handler
**Socket.io:** io, Socket from socket.io-client
**Date:** formatDistanceToNowStrict from date-fns
**Internal:** TypingIndicator from @/components/risalah/TypingIndicator

### Key Components
- `ConversationRow` (memo) — Chat list item with avatar, name, time, last message preview, unread badge, online indicator, typing indicator, read receipts (check/check-check icons)

### API Queries
| Query Key | API Call | Config |
|-----------|---------|--------|
| `['conversations']` | `messagesApi.getConversations()` | Single query, invalidated on socket new_message |

### Mutations
| Mutation | API Call | Invalidates |
|----------|---------|-------------|
| archive | `messagesApi.archiveConversation(id)` | `['conversations']` |

### Real-time Socket.io Connection
- Connects to `SOCKET_URL` with Clerk JWT auth token
- Transports: websocket only
- Reconnection: 10 attempts, 1s delay
- **On connect_error:** refreshes token via `getToken({ skipCache: true })`
- **Events handled:**
  - `user_online` → adds to onlineUsers Set
  - `user_offline` → removes from onlineUsers Set
  - `user_typing` → adds/removes from typingUsers Map<conversationId, Set<userId>>
  - `new_message` → invalidates conversations query
- **Emits:** `join_conversation` for each conversation (to receive typing events)
- **Cleanup:** disconnects on unmount

### State Management
- `activeTab`: 'chats' | 'groups'
- `filterChip`: 'all' | 'unread' | 'groups'
- `openNewConvoSheet`: boolean
- `onlineUsers`: Set<string>
- `typingUsers`: Map<string, Set<string>>
- `unreadMessages`: computed from all conversations, pushed to Zustand store

### FlatList Configuration (standard FlatList, not FlashList)
- `getItemLayout`: fixed height 72px per item
- `maxToRenderPerBatch`: 5
- `windowSize`: 5
- `removeClippedSubviews`: true

### Key Features
1. **Tab selector** — Chats / Groups
2. **Filter chips** — All / Unread / Groups
3. **Conversation list** with:
   - Online status dot on avatar
   - Typing indicator (inline TypingIndicator component with animated dots)
   - Unread count badge (emerald)
   - Unread marker (emerald start border)
   - Read receipts (single check = sent, double check emerald = read)
   - Muted indicator (volume-x icon)
   - Time ago (relative)
4. **Swipe-to-archive** — Swipeable right action with archive icon
5. **Archived conversations row** — shows count + chevron to archive screen
6. **New conversation BottomSheet** with 5 options:
   - New Message → `/(screens)/new-conversation`
   - New Group → `/(screens)/create-group`
   - Chat Folders → `/(screens)/chat-folders`
   - DM Notes → `/(screens)/dm-note-editor`
   - Create Broadcast → `/(screens)/create-broadcast`
7. **Broadcast channels FAB** — emerald circle (56x56), hash icon
8. **Press scale animation** — ConversationRow scales to 0.98 on press

### Header Actions
- Search → `/(screens)/search`
- Saved messages → `/(screens)/saved-messages`
- Call history → `/(screens)/call-history`
- New conversation (pencil) → opens BottomSheet

### Navigation Patterns
- Conversation tap → `/(screens)/conversation/{id}`
- Archived row → `/(screens)/archive`
- FAB → `/(screens)/broadcast-channels`

---

## 8. Create Screen (`app/(tabs)/create.tsx`) — 16 lines

### Role
Safety redirect stub. The create tab is hidden (`href: null` in tab layout) but this file exists to handle deep links to `/create`.

### Behavior
- On mount: immediately calls `router.back()`
- Renders empty `<View />` wrapped in `<ScreenErrorBoundary>`
- **Note:** Actual create flow is via `CreateHeaderButton` in the Saf header, which opens `CreateSheet`

---

## 9. Auth Layout (`app/(auth)/_layout.tsx`) — 11 lines

### Configuration
- `Stack` with `headerShown: false`
- 3 screens:
  - `sign-in`
  - `sign-up`
  - `forgot-password`
- Presented as modal from root layout (`presentation: 'modal'`)

---

## 10. Screens Layout (`app/(screens)/_layout.tsx`) — 15 lines

### Configuration
- `Stack` with:
  - `headerShown: false`
  - `contentStyle: { backgroundColor: tc.bg }` (theme-aware)
  - `animation: 'slide_from_right'`
- No explicit screen definitions — uses file-based routing for all 209+ screens

---

## 11. Onboarding Layout (`app/onboarding/_layout.tsx`) — 12 lines

### Configuration
- `Stack` with:
  - `headerShown: false`
  - `gestureEnabled: false` (prevents swipe-back during onboarding)
- 4 screens (sequential flow):
  1. `username`
  2. `profile`
  3. `interests`
  4. `suggested`

---

## 12. Index (`app/index.tsx`) — 10 lines

### Behavior
- Renders `<Redirect href="/(tabs)/saf" />`
- Wrapped in `<ScreenErrorBoundary>`
- This is the app entry point — immediately redirects to the Saf (home) tab

---

## 13. Deep Linking Configuration

### File: `src/utils/deepLinking.ts` — 292 lines

### Supported Schemes
- **Custom scheme:** `mizanly://`
- **Universal links:** `https://mizanly.com/`

### Supported Deep Link Screens (14 routes)

| Screen | URL Pattern | Navigation Target |
|--------|-----------|-------------------|
| `post` | `mizanly://post/{id}` | `/(screens)/post/{id}` |
| `profile` | `mizanly://profile/{username}` | `/(screens)/profile/{username}` |
| `conversation` | `mizanly://conversation/{id}` | `/(screens)/conversation/{id}` |
| `live` | `mizanly://live/{id}` | `/(screens)/live/{id}` |
| `event` | `mizanly://event/{id}` | `/(screens)/event-detail?id={id}` |
| `prayer-times` | `mizanly://prayer-times` | `/(screens)/prayer-times` |
| `audio-room` | `mizanly://audio-room/{id}` | `/(screens)/audio-room?id={id}` |
| `thread` | `mizanly://thread/{id}` | `/(screens)/thread/{id}` |
| `reel` | `mizanly://reel/{id}` | `/(screens)/reel/{id}` |
| `video` | `mizanly://video/{id}` | `/(screens)/video/{id}` |
| `hashtag` | `mizanly://hashtag/{tag}` | `/(screens)/hashtag/{tag}` |
| `notifications` | `mizanly://notifications` | `/(screens)/notifications` |
| `settings` | `mizanly://settings` | `/(screens)/settings` |
| `search` | `mizanly://search` | `/(screens)/search` |

### URL Parsing
- Supports path parameters: `screen/{id}` extracts `id` param
- Profile uses `username` param instead of `id`
- Hashtag uses `tag` param instead of `id`
- Supports query parameters: `?key=value&key2=value2`
- Supports nested routes: `post/123/comment/456` extracts `{ id: "123", comment: "456" }`
- Falls back to home screen for unknown screens

### Deep Link Generation
- `getDeepLinkUrl(screen, params)` builds `mizanly://` URLs

### Listener Setup
- `setupDeepLinkListeners()` called from `DeepLinkHandler` in root layout
- Handles cold start via `Linking.getInitialURL()`
- Handles background via `Linking.addEventListener('url', ...)`

### Share Intent Handling (separate, in root layout)
- `ShareIntentHandler` component listens for `Linking` URL events
- Checks for `sharedText`, `sharedImage`, `sharedVideo`, `sharedUrl` query params
- Navigates to `/(screens)/share-receive` with params

---

## 14. Cross-Screen Patterns

### Scroll Position Persistence
All scrollable tab screens save scroll position to Zustand store:
- **Saf:** `safScrollOffset` — pixel offset, saved on scroll (throttled delta > 50px), restored on useFocusEffect
- **Bakra:** `bakraScrollOffset` — currentIndex * SCREEN_H, restored on useFocusEffect
- **Majlis:** `majlisScrollOffset` — pixel offset, same throttle pattern
- **Minbar:** No persistence (uses useScrollToTop only)
- **Risalah:** No persistence (uses useScrollToTop only)

### Scroll-Linked Header
Used by: Saf, Minbar, Majlis (all via `useScrollLinkedHeader(56)`)
- Header collapses proportionally on scroll down
- Title fades/scales separately from header container
- Bakra does NOT use it (absolute overlay headers)

### "New Posts" Real-Time Banner
Used by: Saf, Majlis
- Polls every 30s when user has scrolled >200px down
- Compares latest server post ID with current top of feed
- Shows emerald pill banner with arrow icon
- Banner clears when user scrolls back to top (<50px)

### Empty States (3 variants per screen)
1. **Error** — globe icon, "Something went wrong", retry button
2. **Loading** — Skeleton cards with staggered FadeInUp entrance
3. **Empty** — contextual icon + message + action button

### Common Header Pattern
All tabs share consistent header layout:
- Left: logo text (emerald, PlayfairDisplay_700Bold)
- Right: action icons with animated press (gap: spacing.lg)
- RTL-aware via `rtlFlexRow(isRTL)`

### Theme Awareness
All screens use `useThemeColors()` for dynamic colors:
- Container background: `tc.bg`
- Text: `tc.text.primary`, `tc.text.secondary`, `tc.text.tertiary`
- Cards: `tc.bgCard`
- Surfaces: `tc.surface`
- Borders: `tc.border`
- Note: StyleSheet static styles use `colors.dark.*` as defaults, overridden by inline `tc.*` styles

### RTL Support
All screens import and use RTL utilities:
- `rtlFlexRow(isRTL)` — flips flexDirection
- `rtlTextAlign(isRTL)` — flips text alignment
- `rtlAbsoluteEnd(isRTL, offset)` — positions badges correctly
- `rtlMargin(isRTL, start, end)` — flips margins
- `rtlBorderStart(isRTL, width, color)` — flips border side
- `rtlChevron(isRTL, direction)` — flips chevron direction

### Accessibility
All screens include:
- `accessibilityLabel` on interactive elements
- `accessibilityRole` ("button", "tab")
- `accessibilityHint` on key actions
- `accessibilityState` on tab selectors (selected)

---

## 15. Zustand Store Integration

### Store Values Read by Tab Screens

| Store Key | Used By | Purpose |
|-----------|---------|---------|
| `safFeedType` | Saf | 'following' \| 'foryou' |
| `setSafFeedType` | Saf | Setter |
| `majlisFeedType` | Majlis | 'foryou' \| 'following' \| 'trending' \| 'video' |
| `setMajlisFeedType` | Majlis | Setter |
| `unreadNotifications` | Saf, Tab layout | Badge count |
| `setUnreadNotifications` | Saf, Minbar | Setter (from API poll + bell press reset) |
| `unreadMessages` | Tab layout | Badge count |
| `setUnreadMessages` | Risalah | Setter (computed from conversations) |
| `safScrollOffset` | Saf | Scroll persistence |
| `setSafScrollOffset` | Saf | Setter |
| `bakraScrollOffset` | Bakra | Scroll persistence |
| `setBakraScrollOffset` | Bakra | Setter |
| `majlisScrollOffset` | Majlis | Scroll persistence |
| `setMajlisScrollOffset` | Majlis | Setter |
| `biometricLockEnabled` | Root layout | BiometricLockOverlay trigger |
| `archivedConversationsCount` | Risalah | Archived row badge |
| `isCreateSheetOpen` | (CreateSheet) | CreateSheet visibility |
| `setStoryViewerData` | Saf | Pass story data to viewer |
| `user` | Root layout | Widget data sync |
| `theme` | Root layout | StatusBar style |

---

## 16. Navigation Graph Summary

```
app/index.tsx ──[Redirect]──> (tabs)/saf

(auth)/ ──[modal presentation]──
  ├── sign-in
  ├── sign-up
  └── forgot-password

onboarding/ ──[gesture disabled]──
  ├── username
  ├── profile
  ├── interests
  └── suggested

(tabs)/ ──[5 visible tabs]──
  ├── saf (home) ──> search, notifications, profile, story-viewer, create-story, discover, post/{id}
  ├── bakra (reels) ──> search, trending-audio, create-reel, profile/{username}, report, sound/{id}, go-live, series-discover
  ├── minbar (videos) ──> search, watch-history, notifications, video/{id}, channel/{handle}, report, create-video, discover
  ├── majlis (threads) ──> audio-room, majlis-lists, search, create-thread, hashtag/{name}
  ├── risalah (messages) ──> search, saved-messages, call-history, new-conversation, create-group, chat-folders, dm-note-editor, create-broadcast, conversation/{id}, archive, broadcast-channels
  └── create [hidden] ──> router.back()

(screens)/ ──[slide_from_right, 209+ screens]──
  └── All screen routes live here
```
