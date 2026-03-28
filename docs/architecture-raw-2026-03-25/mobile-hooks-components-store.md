# Mobile Hooks, Components, Store, Theme & Types — Full Architecture Extraction

> Extracted: 2026-03-25 | Source: `apps/mobile/src/hooks/`, `apps/mobile/src/components/`, `apps/mobile/src/store/`, `apps/mobile/src/theme/`, `apps/mobile/src/types/`

---

## 1. HOOKS (24 files)

### 1.1 useResponsive
**File:** `apps/mobile/src/hooks/useResponsive.ts` (47 lines)
**Params:** none
**Returns:** `{ isDesktop: boolean, isTablet: boolean, isMobile: boolean, width: number }`
**Logic:** Listens to `Dimensions.addEventListener('change')`. Breakpoints: Desktop >= 1024px, Tablet 768-1023px, Mobile < 768px. Updates on window resize.

### 1.2 useAnimatedPress
**File:** `apps/mobile/src/hooks/useAnimatedPress.ts` (34 lines)
**Params:** `options?: { scaleTo?: number (default 0.92), spring?: { damping, stiffness, mass? } (default animation.spring.bouncy) }`
**Returns:** `{ onPressIn, onPressOut, animatedStyle, scale }`
**Logic:** Reanimated `useSharedValue(1)` for scale. `onPressIn` springs to `scaleTo`, `onPressOut` springs back to 1. Both callbacks have `'worklet'` directive. Used across all pressable UI components.

### 1.3 useScrollDirection
**File:** `apps/mobile/src/hooks/useScrollDirection.ts` (48 lines)
**Params:** `headerHeight = 56, tabBarHeight = 80`
**Returns:** `{ onScroll, headerAnimatedStyle, tabBarAnimatedStyle }`
**Logic:** Hide-on-scroll-down, reveal-on-scroll-up pattern. Tracks `scrollY` via ref. Threshold of 5px diff to trigger. At top (y <= 0) always shows. Header translateY to `-headerHeight`, tab bar translateY to `+tabBarHeight`. Uses `withTiming(200ms)` with cubic easing.

### 1.4 useReducedMotion
**File:** `apps/mobile/src/hooks/useReducedMotion.ts` (46 lines)
**Params:** none
**Returns:** `boolean` (true if reduced motion preferred)
**Logic:** Checks both system `AccessibilityInfo.isReduceMotionEnabled()` AND Zustand `store.reducedMotion`. Returns OR of both. Listens for `reduceMotionChanged` events.
**Also exports:** `useAccessibleAnimation()` -> `{ reducedMotion, spring, duration(normalMs) }` which returns instant timing (duration 0) when reduced motion is on.

### 1.5 useTranslation
**File:** `apps/mobile/src/hooks/useTranslation.ts` (27 lines)
**Params:** none
**Returns:** `{ t, language: SupportedLanguage, changeLanguage, isRTL }`
**Logic:** Wraps `react-i18next` useTranslation. `SupportedLanguage = 'en' | 'ar' | 'tr' | 'ur' | 'bn' | 'fr' | 'id' | 'ms'`. RTL = `language === 'ar' || language === 'ur'`.

### 1.6 useIslamicTheme
**File:** `apps/mobile/src/hooks/useIslamicTheme.ts` (47 lines)
**Params:** none
**Returns:** `IslamicThemeOverride | null`
**Logic:** Checks `store.islamicThemeEnabled`. Calls `getActiveIslamicTheme()` from `@/theme/islamicThemes`. Recalculates every 60 seconds via `setInterval` to detect Ramadan/Eid/Jummah transitions.
**Also exports:** `useIsEidToday()` -> `boolean`. Same 60-second recalculation pattern.

### 1.7 useHaptic (DEPRECATED - use useContextualHaptic instead)
**File:** `apps/mobile/src/hooks/useHaptic.ts` (47 lines)
**Params:** none
**Returns:** `{ light, medium, heavy, success, warning, error, selection }`
**Logic:** Wraps `expo-haptics`. All callbacks check `isHapticAvailable()` (iOS/Android only). Each fires-and-forgets with `.catch(() => {})`. Legacy hook -- rule 17 mandates `useContextualHaptic` instead.

### 1.8 useNetworkStatus
**File:** `apps/mobile/src/hooks/useNetworkStatus.ts` (14 lines)
**Params:** none
**Returns:** void (side effect only)
**Logic:** Subscribes to `NetInfo.addEventListener`. Sets `store.setIsOffline(state.isConnected === false)`. Cleanup on unmount.

### 1.9 useWebKeyboardShortcuts
**File:** `apps/mobile/src/hooks/useWebKeyboardShortcuts.ts` (51 lines)
**Params:** none
**Returns:** void
**Logic:** Web-only (no-op on native). Registers global `keydown` listener. Ctrl+K -> search, Ctrl+N -> create-post, Esc -> router.back(). Uses `document.addEventListener`.

### 1.10 useEntranceAnimation
**File:** `apps/mobile/src/hooks/useEntranceAnimation.ts` (47 lines)
**Params:** `options?: { delay?: number (0), translateY?: number (20), duration?: number (animation.timing.normal=250) }`
**Returns:** `{ animatedStyle }`
**Logic:** Fire-once on mount. Animates opacity 0->1 and translateY initial->0 using `withDelay` + `withTiming` with `Easing.out(Easing.cubic)`. Empty deps array is intentional (entrance-only).

### 1.11 useChatLock
**File:** `apps/mobile/src/hooks/useChatLock.ts` (89 lines)
**Params:** none
**Returns:** `{ isLocked, lockConversation, unlockConversation, authenticateForChat, isBiometricAvailable }`
**Logic:** Uses `expo-secure-store` to persist locked conversation IDs (JSON array). Uses `expo-local-authentication` for Face ID / fingerprint. `authenticate()` checks hardware availability + enrollment before prompting. Denies access (returns false) if no biometrics hardware — does NOT bypass lock. All methods are `useCallback` wrapped.

### 1.12 usePiP
**File:** `apps/mobile/src/hooks/usePiP.ts` (66 lines)
**Params:** `{ isPlaying: boolean, onPiPChange?: (active: boolean) => void }`
**Returns:** `{ isPiPActive, isPiPSupported, enterPiP, exitPiP }`
**Logic:** Android uses NativeModules.PiPModule.enterPiPMode(). iOS relies on AVPlayerViewController native PiP via useNativeControls prop. Auto-enters PiP when app goes to background while playing. Auto-exits when app returns to foreground. `onPiPChange` stored in ref to avoid stale closures.

### 1.13 useTTS
**File:** `apps/mobile/src/hooks/useTTS.ts` (194 lines)
**Params:** none
**Returns:** `{ speak, pause, restart, stop, cycleSpeed, isPlaying, currentText, currentTitle, speed, isActive, SPEED_OPTIONS }`
**Logic:** Full text-to-speech engine using `expo-speech`. Speed options: 0.75, 1, 1.25, 1.5. Auto-detects language from text content (Arabic regex, Turkish chars, Urdu/Persian chars, Bengali, French accents, fallback to i18n locale). Quran detection requires 2+ pattern matches (surah, ayah, bismillah, verse refs) to avoid false positives -- returns `{ isQuran: true }` to indicate proper recitation should be used instead. `ignoringStopRef` prevents race condition during speed cycling where Speech.stop()'s onStopped callback would fire before Speech.speak starts.

### 1.14 useIsWeb
**File:** `apps/mobile/src/hooks/useIsWeb.ts` (24 lines)
**Params:** none
**Returns:** `boolean`
**Logic:** Returns `Platform.OS === 'web'`. Also exports constant `IS_WEB` for non-hook contexts.

### 1.15 usePushNotifications
**File:** `apps/mobile/src/hooks/usePushNotifications.ts` (120 lines)
**Params:** `isSignedIn: boolean`
**Returns:** void (side effect)
**Logic:** Wires up push notification registration + badge reset. Calls `usePushNotificationHandler(isSignedIn)` for foreground/tap handling. On sign-in: requests permissions, creates Android notification channel (MAX importance), gets Expo push token with `EXPO_PUBLIC_PROJECT_ID`, registers token via `devicesApi.register()`. Listens for native token refreshes (APNs/FCM rotation). Resets badge to 0 when app comes to foreground. Resets `registered` ref on sign-out.

### 1.16 usePushNotificationHandler
**File:** `apps/mobile/src/hooks/usePushNotificationHandler.ts` (227 lines)
**Params:** `isSignedIn: boolean = true`
**Returns:** `{ navigateFromNotification }`
**Logic:** Configures foreground notification handler (show alert + sound + badge). Routes notification taps to correct screen based on `data.type`: like/comment -> post/thread/reel/video detail, follow -> profile, message -> conversation, mention -> content detail, live -> live session, prayer -> prayer-times, event -> event-detail, tip/membership -> monetization, audio_room -> audio room, admin/system -> notifications list. 13 notification types handled. Falls back to notifications screen for unknown types.

### 1.17 useStaggeredEntrance
**File:** `apps/mobile/src/hooks/useStaggeredEntrance.ts` (62 lines)
**Params:** `index: number, options?: { delay?: number (40), duration?: number (350), translateY?: number (20), maxIndex?: number (15) }`
**Returns:** Reanimated `AnimatedStyle` (opacity + translateY)
**Logic:** Staggered fade+slide for list items. Each item delayed by `index * delay` ms. Uses cinematic easing `Easing.bezier(0.16, 1, 0.3, 1)`. Clamps at `maxIndex` (items beyond it appear without extra delay). Respects reduced motion (instant values when enabled). Fire-once pattern with empty deps.

### 1.18 useContextualHaptic
**File:** `apps/mobile/src/hooks/useContextualHaptic.ts` (88 lines)
**Params:** none
**Returns:** `{ like, follow, save, navigate, tick, delete, error, longPress, send, success }`
**Logic:** 10 semantic haptic patterns mapped to physical feedback:
- `like` -> ImpactFeedbackStyle.Medium (satisfying thud)
- `follow` -> NotificationFeedbackType.Success
- `save` -> ImpactFeedbackStyle.Light
- `navigate` -> ImpactFeedbackStyle.Light
- `tick` -> selectionAsync() (picker click)
- `delete` -> NotificationFeedbackType.Warning
- `error` -> NotificationFeedbackType.Error
- `longPress` -> ImpactFeedbackStyle.Heavy
- `send` -> ImpactFeedbackStyle.Medium
- `success` -> NotificationFeedbackType.Success
All wrapped in `useMemo(() => {...}, [])`. All check `isHapticAvailable()` and `.catch(() => {})`.

### 1.19 useScrollLinkedHeader
**File:** `apps/mobile/src/hooks/useScrollLinkedHeader.ts` (86 lines)
**Params:** `headerHeight: number = 56`
**Returns:** `{ onScroll, headerAnimatedStyle, titleAnimatedStyle, blurIntensity, scrollY }`
**Logic:** Elastic header collapse with progressive blur. Uses `useAnimatedScrollHandler`. Header translateY interpolated 0 -> -headerHeight over scroll range 0 -> headerHeight (clamped). Title opacity 1 -> 0 over first 50% of scroll. Blur intensity 0 -> 60 over first half of header height. All values driven by `scrollY` shared value.

### 1.20 useAnimatedIcon
**File:** `apps/mobile/src/hooks/useAnimatedIcon.ts` (79 lines)
**Params:** `type: 'bounce' | 'shake' | 'pulse' | 'spin' = 'bounce'`
**Returns:** `{ animatedStyle, trigger }`
**Logic:** Four icon animation types:
- `bounce`: scale 1 -> 1.3 -> 0.9 -> 1 (heart-like, spring d4/s300 -> d4/s300 -> d10/s200)
- `shake`: rotation -12 -> 12 -> -8 -> 8 -> -4 -> 0 (bell, 50ms each)
- `pulse`: scale 1 -> 1.2 -> 1 (spring d8/s300 -> d10/s200)
- `spin`: rotation 0 -> 360 (500ms timing)
AnimatedStyle outputs scale + rotate transforms.

### 1.21 useThemeColors
**File:** `apps/mobile/src/hooks/useThemeColors.ts` (35 lines)
**Params:** none
**Returns:** `{ bg, bgElevated, bgCard, bgSheet, surface, surfaceHover, border, borderLight, borderHighlight, text: { primary, secondary, tertiary, inverse, onColor }, isDark }`
**Logic:** Reads `store.theme` ('dark'|'light'|'system'). For 'system', listens to `Appearance.addChangeListener`. Calls `getThemeColors(theme)` which resolves system preference and returns dark or light surface+text colors.
**Also exports:** `useThemeBg()` -> single background color string.

### 1.22 useAmbientColor
**File:** `apps/mobile/src/hooks/useAmbientColor.ts` (139 lines)
**Params:** `imageUri: string | undefined | null`
**Returns:** `{ dominantColor: string | null, secondaryColor: string | null }`
**Logic:** Extracts dominant/secondary colors from video thumbnails for gradient backgrounds. 3-tier strategy:
1. `react-native-image-colors` real extraction (quality: 'lowest', cached)
2. Platform-specific result parsing (Android: dominant/vibrant, iOS: primary/secondary, Web: dominant/vibrant)
3. Hash-based fallback: deterministic HSL colors from URL string hash
Colors darkened for ambient use (30% opacity hex suffix). In-memory LRU cache (Map, 50 entries max). `mountedRef` prevents setState after unmount. Exported `clearAmbientCache()` for memory warning cleanup.

### 1.23 useVideoPreloader
**File:** `apps/mobile/src/hooks/useVideoPreloader.ts` (141 lines)
**Params:** `poolSize = 3`
**Returns:** `{ onViewableChange, markPlaying, isReady, getLoadState, clearAll, preloadCount }`
**Logic:** Advanced preload manager for reel-style feeds. Pool of slots: previous, current, next. Preloads first 256KB of each video via `fetch()` with `Range: bytes=0-262143` header (primes CDN cache + device cache). When user swipes, evicts slots 3+ positions behind (aborts in-progress fetches). Keeps `preloadedUrls` bounded at 20. Load states: idle, loading, ready, playing, error.

### 1.24 useWebRTC
**File:** `apps/mobile/src/hooks/useWebRTC.ts` (374 lines)
**Params:** `{ socketRef, socketReady, targetUserId, callType: 'voice'|'video', iceServers, isInitiator, onConnected?, onDisconnected?, onFailed? }`
**Returns:** `{ localStream, remoteStream, connectionState, isMuted, isFrontCamera, isVideoEnabled, start, hangup, toggleMute, toggleVideo, flipCamera }`
**Logic:** Complete RTCPeerConnection lifecycle for 1-on-1 calls. Key architecture decisions:
- `pc.ontrack` (not addEventListener) to avoid event-target-shim TS issue
- Pattern B for remote streams: manual `addTrack` to controlled `MediaStream` (more robust than `event.streams[0]`)
- Callback refs for `onConnected/onDisconnected/onFailed` to prevent stale closures in PC event handlers
- `startingRef` mutex prevents double-start during async `getUserMedia`
- ICE trickle with queue (max 200 candidates) for candidates arriving before remote description
- `stream.release()` on cleanup to free native resources (iOS AVCaptureSession, Android Camera)
- `flipCamera` uses modern `applyConstraints()` API (v124+), falls back to deprecated `_switchCamera()`
- Signal filtering: only accepts signals from `targetUserId`
- Cleanup on unmount: nulls all event handlers, closes PC, releases streams

---

## 2. ZUSTAND STORE

**File:** `apps/mobile/src/store/index.ts` (448 lines)
**Library:** Zustand v4 with `persist` middleware + `createJSONStorage(() => AsyncStorage)`
**Store name:** `mizanly-store`

### 2.1 State Fields & Actions (grouped by domain)

| Domain | State Field | Type | Default | Action |
|--------|-------------|------|---------|--------|
| **Auth** | `user` | `User \| null` | `null` | `setUser(user)` -> sets `isAuthenticated` |
| | `isAuthenticated` | `boolean` | `false` | (derived from user) |
| **Theme** | `theme` | `'dark' \| 'light' \| 'system'` | `'dark'` | `setTheme(theme)` |
| **Network** | `isOffline` | `boolean` | `false` | `setIsOffline(v)` |
| **Notifications** | `unreadNotifications` | `number` | `0` | `setUnreadNotifications(count)` |
| **Messages** | `unreadMessages` | `number` | `0` | `setUnreadMessages(count)` |
| **Feed** | `safFeedType` | `'following' \| 'foryou'` | `'following'` | `setSafFeedType(type)` |
| | `majlisFeedType` | `'foryou' \| 'following' \| 'trending' \| 'video'` | `'foryou'` | `setMajlisFeedType(type)` |
| **Create** | `isCreateSheetOpen` | `boolean` | `false` | `setCreateSheetOpen(open)` |
| **Hashtags** | `followedHashtags` | `string[]` | `[]` | `addFollowedHashtag(tag)`, `removeFollowedHashtag(tag)` |
| **Nasheed** | `nasheedMode` | `boolean` | `false` | `setNasheedMode(enabled)` |
| **Call** | `activeCallId` | `string \| null` | `null` | `setActiveCallId(id)` |
| **Live** | `activeLiveSessionId` | `string \| null` | `null` | `setActiveLiveSessionId(id)` |
| | `isLiveStreaming` | `boolean` | `false` | `setIsLiveStreaming(v)` |
| **Stickers** | `recentStickerPackIds` | `string[]` | `[]` | `addRecentStickerPack(packId)` (dedupes, max 20) |
| **Channels** | `mutedChannelIds` | `string[]` | `[]` | `toggleMutedChannel(channelId)` |
| **Feed Prefs** | `feedDismissedIds` | `string[]` | `[]` | `addFeedDismissed(contentId)` (max 200) |
| **Search** | `searchHistory` | `string[]` | `[]` | `addSearchHistory(query)` (dedupes, max 20), `clearSearchHistory()` |
| **Archive** | `archivedConversationsCount` | `number` | `0` | `setArchivedConversationsCount(count)` |
| **Biometric** | `biometricLockEnabled` | `boolean` | `false` | `setBiometricLockEnabled(enabled)` |
| **Screen Time** | `screenTimeSessionStart` | `number \| null` | `null` | `setScreenTimeSessionStart(ts)` |
| | `screenTimeLimitMinutes` | `number \| null` | `null` | `setScreenTimeLimitMinutes(limit)` |
| **AutoPlay** | `autoPlaySetting` | `'wifi' \| 'always' \| 'never'` | `'wifi'` | `setAutoPlaySetting(s)` |
| **Recording** | `isRecording` | `boolean` | `false` | `setIsRecording(v)` |
| **Mini Player** | `miniPlayerVideo` | `{ id, title, channelName, thumbnailUri?, videoUrl } \| null` | `null` | `setMiniPlayerVideo(video)` |
| | `miniPlayerProgress` | `number` (0-1) | `0` | `setMiniPlayerProgress(progress)` |
| | `miniPlayerPlaying` | `boolean` | `false` | `setMiniPlayerPlaying(playing)` |
| | — | — | — | `closeMiniPlayer()` (resets all 3 fields) |
| **Downloads** | `downloadQueue` | `string[]` | `[]` | `addToDownloadQueue(id)`, `removeFromDownloadQueue(id)` |
| **PiP** | `isPiPActive` | `boolean` | `false` | `setIsPiPActive(active)` |
| | `pipVideoId` | `string \| null` | `null` | `setPiPVideoId(id)` |
| **Ambient** | `ambientModeEnabled` | `boolean` | `false` | `setAmbientModeEnabled(enabled)` |
| **A11y** | `reducedMotion` | `boolean` | `false` | `setReducedMotion(v)` |
| | `highContrast` | `boolean` | `false` | `setHighContrast(v)` |
| **Parental** | `isChildAccount` | `boolean` | `false` | `setIsChildAccount(v)` |
| | `parentalRestrictions` | `ParentalRestrictions \| null` | `null` | `setParentalRestrictions(r)` |
| **Story Viewer** | `storyViewerData` | `{ groups, startIndex, isOwn? } \| null` | `null` | `setStoryViewerData(data)` |
| **Islamic** | `islamicThemeEnabled` | `boolean` | `true` | `setIslamicThemeEnabled(enabled)` |
| **TTS** | `ttsText` | `string \| null` | `null` | `setTTSText(text)` |
| | `ttsTitle` | `string \| null` | `null` | `setTTSTitle(title)` |
| | `ttsPlaying` | `boolean` | `false` | `setTTSPlaying(playing)` |
| | `ttsSpeed` | `number` | `1` | `setTTSSpeed(speed)` |
| | — | — | — | `stopTTS()` (resets all 4 TTS fields) |
| **Scroll Pos** | `safScrollOffset` | `number` | `0` | `setSafScrollOffset(offset)` |
| | `majlisScrollOffset` | `number` | `0` | `setMajlisScrollOffset(offset)` |
| | `bakraScrollOffset` | `number` | `0` | `setBakraScrollOffset(offset)` |
| **Toasts** | `toasts` | `Array<{ id, message, variant, duration?, action? }>` | `[]` | `addToast(toast)` (keeps max 2), `dismissToast(id)` |
| **Auth** | — | — | — | `logout()` (resets ALL state to defaults) |

### 2.2 Persisted Fields (via `partialize`)
Only these fields survive app restart (stored in AsyncStorage):
- `theme`, `safFeedType`, `majlisFeedType`, `followedHashtags`, `recentStickerPackIds`
- `searchHistory`, `mutedChannelIds`, `nasheedMode`, `biometricLockEnabled`
- `screenTimeLimitMinutes`, `autoPlaySetting`, `ambientModeEnabled`
- `islamicThemeEnabled`, `feedDismissedIds`

**NOT persisted (transient):** user, isAuthenticated, isOffline, unreadNotifications, unreadMessages, isCreateSheetOpen, activeCallId, isLiveStreaming, isRecording, miniPlayer*, downloadQueue, isPiPActive, storyViewerData, tts*, scrollOffsets, toasts

### 2.3 Granular Selectors (37 total)
Exported as named hooks: `useUser`, `useTheme`, `useUnreadNotifications`, `useUnreadMessages`, `useSafFeedType`, `useMajlisFeedType`, `useFollowedHashtags`, `useActiveCallId`, `useActiveLiveSessionId`, `useIsLiveStreaming`, `useRecentStickerPackIds`, `useMutedChannelIds`, `useFeedDismissedIds`, `useSearchHistory`, `useArchivedConversationsCount`, `useIsRecording`, `useMiniPlayerVideo`, `useMiniPlayerProgress`, `useMiniPlayerPlaying`, `useNasheedMode`, `useBiometricLockEnabled`, `useScreenTimeSessionStart`, `useScreenTimeLimitMinutes`, `useAutoPlaySetting`, `useDownloadQueue`, `useIsPiPActive`, `usePiPVideoId`, `useAmbientModeEnabled`, `useIsChildAccount`, `useParentalRestrictions`, `useIslamicThemeEnabled`, `useTTSActive` (derived: `!!s.ttsText`), `useTTSPlaying`, `useSafScrollOffset`, `useMajlisScrollOffset`, `useBakraScrollOffset`

---

## 3. THEME

**File:** `apps/mobile/src/theme/index.ts` (436 lines)

### 3.1 Colors
```
Brand:         emerald=#0A7B4F  emeraldLight=#0D9B63  emeraldDark=#066B42
               gold=#C8963E     goldLight=#D4A94F     cream=#FEFCF7

Dark theme:    bg=#0D1117  bgElevated=#161B22  bgCard=#1C2333
               bgSheet=#21283B  surface=#2D3548  surfaceHover=#374151
               border=#30363D  borderLight=#484F58
               borderHighlight=rgba(255,255,255,0.1)

Light theme:   bg=#FFFFFF  bgElevated=#F6F8FA  bgCard=#FFFFFF
               bgSheet=#FFFFFF  surface=#F3F4F6  surfaceHover=#E5E7EB
               border=#D0D7DE  borderLight=#E5E7EB
               borderHighlight=rgba(0,0,0,0.05)

Dark text:     primary=#FFF  secondary=#9BA4AE  tertiary=#8B949E
               inverse=#1E293B  onColor=#FFF
Light text:    primary=#1F2937  secondary=#4B5563  tertiary=#6B7280
               inverse=#FFF  onColor=#FFF

Semantic:      error=#F85149  warning=#D29922  success=#0A7B4F  info=#58A6FF  live=#FF3B3B
Social:        like=#F85149  bookmark=#C8963E  online=#0A7B4F

Glass:         dark=rgba(13,17,23,0.85)  darkHeavy=rgba(13,17,23,0.90)
               light=rgba(255,255,255,0.15)  border=rgba(255,255,255,0.12)

Active:        emerald5/10/15/20/30/40/50, gold10/15/20/30/50, error10, white5/6/10

Extended:      blue=#58A6FF  purple=#A371F7  purpleLight=#D2A8FF  violet=#7C3AED
               orange=#F59E0B  orangeDark=#F0883E  orangeLight=#FFA657
               greenBright=#3FB950  greenDark=#05593A  goldDark=#A67C00
               red=#FF7B72  white=#FFF  black=#000

Gradients:     cardDark=[rgba(45,53,72,0.4), rgba(28,35,51,0.2)]
               cardMedium=[rgba(45,53,72,0.6), rgba(28,35,51,0.3)]
               cardHeavy=[rgba(45,53,72,0.4), rgba(28,35,51,0.4)]
               emerald=[rgba(10,123,79,0.9), rgba(6,107,66,0.95)]
```

### 3.2 Typography
```
Fonts:         heading = PlayfairDisplay_700Bold
               body = DMSans_400Regular
               bodyMedium = DMSans_500Medium
               bodySemiBold = DMSans_500Medium
               bodyBold = DMSans_700Bold
               arabic = NotoNaskhArabic_400Regular
               arabicBold = NotoNaskhArabic_700Bold
               mono = Platform.select(ios:Menlo, android:monospace)

FontSize:      xs=11 sm=13 base=15 md=17 lg=20 xl=24 2xl=28 3xl=34 4xl=42
FontSizeExt:   micro=9 tiny=10 caption=12 body=14 subtitle=16 title=18
               heading=28 display=32 hero=36 jumbo=48

LineHeight:    xs=16 sm=18 base=22 md=24 lg=28 xl=32 2xl=36 3xl=44 4xl=52
LetterSpacing: tight=-1.2 snug=-0.8 normal=0 wide=0.5 wider=1.0
FontWeight:    regular='400' medium='500' semibold='600' bold='700'
```

### 3.3 Spacing, Radius, Shadow, Elevation
```
Spacing:       xs=4 sm=8 md=12 base=16 lg=20 xl=24 xxl/2xl=32 3xl=40 4xl=48
Radius:        sm=6 md=10 lg=16 xl=24 full=9999
Shadow:        sm(offset:0,2 opacity:0.15 radius:4 elev:2)
               md(offset:0,6 opacity:0.2 radius:10 elev:6)
               lg(offset:0,12 opacity:0.25 radius:20 elev:12)
               glow(emerald, offset:0,0 opacity:0.4 radius:10 elev:8)
Elevation:     surface(shadow.sm), raised(shadow.md+border), overlay(shadow.md+border),
               modal(shadow.lg+border), toast(offset:0,16 opacity:0.4 radius:32 elev:16)
```

### 3.4 Sizing Tokens
```
TabBar:        height=83 (49pt + 34pt safe area), barHeight=49, iconSize=24
IconSize:      xs=16 sm=20 md=24 lg=28 xl=32
Avatar:        xs=24 sm=32 md=40 lg=52 xl=64 2xl=96 3xl=128
```

### 3.5 Animation Presets
```
Spring:        responsive(d14 s170 m0.5), bouncy(d10 s400 m0.6),
               gentle(d20 s100 m0.8), snappy(d12 s350 m0.4), fluid(d18 s150 m0.9)
Timing:        fast=150ms, normal=250ms, slow=400ms, shimmer=1200ms
Easing:        cinematic=[0.16,1,0.3,1], decelerate=[0,0,0.2,1], accelerate=[0.4,0,1,1]
Stagger:       item=40ms, section=80ms
Entrance:      duration=350ms
Exit:          duration=250ms (70% of entrance — Material rule)
```

### 3.6 Interaction & Glassmorphism
```
Interaction:   pressed=rgba(255,255,255,0.04), hover=rgba(255,255,255,0.06)
               disabledOpacity=0.38, focusRingColor=emerald, focusRingWidth=2

Glass:         light(blur:40, overlay:white8%, border:white12%, borderW:0.5)
               medium(blur:60, overlay:white12%, border:white15%, borderW:0.5)
               heavy(blur:85, overlay:dark65%, border:white15%, borderW:0.5)
               ultra(blur:100, overlay:dark85%, border:white20%, borderW:1)
```

### 3.7 Utility Functions
- `getThemeColors(theme: 'dark'|'light'|'system')` -> resolves system preference, returns `{ ...surface, text, isDark }`
- `getElevation(theme)` -> theme-aware elevation presets (surface/raised/overlay/modal/toast)

---

## 4. UI COMPONENTS (47 files in components/ui/)

### 4.1 Icon
**File:** `components/ui/Icon.tsx` (179 lines)
**Props:** `{ name: IconName, size?: Size|number, color?: string, strokeWidth?: number (1.75), fill?: string, style? }`
**Features:** 80+ icon names mapped to Lucide React Native components. `memo()` wrapped. Filled variants for heart-filled and bookmark-filled (fill prop). RTL mirroring for arrow-left, chevron-left, chevron-right (scaleX: -1). Warns in __DEV__ for unknown names.

### 4.2 Avatar
**File:** `components/ui/Avatar.tsx` (313 lines)
**Props:** `{ uri?, name?, size?: 'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl', showRing?, ringColor?, showOnline?, showStoryRing?, storyViewed?, onPress?, accessibilityLabel?, blurhash? }`
**Features:** `memo()` wrapped. 3 ring modes: unseen story (rotating emerald->gold LinearGradient), viewed story (static gray ring), plain (optional custom ring). Online dot with pulse animation (infinite withRepeat withSequence). Spring press animation (0.92 scale). CDN-optimized image via `imagePresets.avatar()`. Fallback initial letter. Blurhash placeholder via expo-image.

### 4.3 BottomSheet
**File:** `components/ui/BottomSheet.tsx` (305 lines)
**Props:** `{ visible, onClose, children, snapPoint? (0-1), blurBackdrop?, scrollable? }`
**Features:** Gesture-based pan-to-dismiss (60px or velocity 800). Rubberband effect when dragging past top. Animated backdrop opacity proportional to drag. BlurView on iOS, solid color on Android. Drag handle with breathing pulse animation (3 cycles). KeyboardAvoidingView. Android hardware back button close. VoiceOver: `accessibilityViewIsModal={true}`, `AccessibilityInfo.announceForAccessibility`. Premium entrance spring (d25 s200 m0.8).
**Also exports:** `BottomSheetItem` (memo'd menu item with spring press, haptic tick on press).

### 4.4 Skeleton
**File:** `components/ui/Skeleton.tsx` (233 lines)
**Exports:** `Skeleton.Circle`, `Skeleton.Rect`, `Skeleton.Text`, `Skeleton.PostCard`, `Skeleton.ThreadCard`, `Skeleton.ConversationItem`, `Skeleton.ProfileHeader`
**Features:** Shimmer animation via `withRepeat` + `withTiming` of translateX. Brand-tinted shimmer (emerald 3-7% opacity, not generic white). RTL-aware shimmer direction. Respects reduced motion (static when enabled). Theme-aware background/border via `useThemeColors()`.

### 4.5 EmptyState
**File:** `components/ui/EmptyState.tsx` (136 lines)
**Props:** `{ icon?, illustration?, title, subtitle?, actionLabel?, onAction?, style? }`
**Features:** Staggered `FadeInUp` entrance (0/80/160/240ms delays). Icon in emerald-tinted circle or custom illustration. CTA button with subtle breathing pulse (1 -> 1.03 infinite). Uses `GradientButton` for action. Respects reduced motion.

### 4.6 GlassHeader
**File:** `components/ui/GlassHeader.tsx` (247 lines)
**Props:** `{ title?, titleComponent?, leftAction?, rightAction?, rightActions?, borderless?, showBackButton?, showBack?, onBack?, style? }`
**Features:** `memo()` wrapped. BlurView on iOS/web, solid dark bg on Android. HeaderButton sub-component with spring press (0.88 scale), haptic navigate. Notification badge (red circle, 99+ cap). Safe area insets for padding. Resolves left action: explicit > showBackButton/showBack > spacer. Multiple right actions support.

### 4.7 GradientButton
**File:** `components/ui/GradientButton.tsx` (308 lines)
**Props:** `{ label, onPress, variant?: 'primary'|'secondary'|'ghost', icon?: IconName, loading?, disabled?, fullWidth?, size?: 'sm'|'md'|'lg', accessibilityLabel?, style? }`
**Features:** 3 variants. Primary: emerald LinearGradient with glow shadow that pulses while loading. Secondary: emerald10 bg with emerald border. Ghost: transparent. 3 size configs (sm: h40, md: h44, lg: h52). Spring press (0.94 scale with d15/s400). Loading state: hidden label + Skeleton overlay (preserves button width). Full accessibility state (disabled, busy).

### 4.8 ProgressiveImage
**File:** `components/ui/ProgressiveImage.tsx` (66 lines)
**Props:** `{ uri, blurhash?, width, height, borderRadius?, contentFit?, transition?, style?, accessibilityLabel? }`
**Features:** `memo()` wrapped. expo-image with blurhash placeholder + 300ms crossfade. `recyclingKey={uri}` prevents FlashList cell flicker. Pass `blurhash={null}` to disable placeholder.

### 4.9 BrandedRefreshControl
**File:** `components/ui/BrandedRefreshControl.tsx` (21 lines)
**Props:** `{ refreshing, onRefresh }`
**Features:** Emerald tint on iOS, alternating emerald+gold on Android. Dark bg for Android progress indicator. Mandatory for all FlatLists (rule 7).

### 4.10 CharCountRing
**File:** `components/ui/CharCountRing.tsx` (125 lines)
**Props:** `{ current, max, size? (28) }`
**Features:** SVG ring using react-native-svg. Appears at 70% (SHOW_AT=0.7). Animated stroke dashoffset. Color interpolation: emerald -> gold (at 90%) -> red (at 100%). Pulse animation (scale 1 -> 1.25 -> 1) when hitting max. Remaining count text appears at 90%.

### 4.11 Toast / showToast / ToastContainer
**File:** `components/ui/Toast.tsx` (356 lines)
**Exports:** `showToast(options)` (callable outside React), `ToastContainer` (mount in root), `ShowToastOptions` type
**Features:** 4 variants with colors+icons: success(emerald/check-circle), error(red/slash), warning(gold/bell), info(blue/globe). Animated entrance (spring d20/s90). Progress bar countdown. Swipe-to-dismiss gesture. Haptic feedback on show (success/error/light). Action button inline. Left accent bar. BlurView bg on iOS. Auto-dismiss with configurable duration (default 3000ms). Positioned from bottom with safe area insets.

### 4.12 RichText
**File:** `components/ui/RichText.tsx` (159 lines)
**Props:** `{ text, style?, numberOfLines?, onPostPress? }`
**Features:** `memo()` wrapped. Regex tokenizer for: #hashtags (emerald, navigate to hashtag), @mentions (emerald, navigate to profile), URLs (emerald underline, Linking.openURL), phone numbers (emerald underline, tel: link), emails (emerald underline, mailto: link). RTL detection via Arabic Unicode range. First URL triggers `<LinkPreview>` below text. All interactive elements call `haptic.navigate()`.

### 4.13 AnimatedAccordion
**File:** `components/ui/AnimatedAccordion.tsx` (162 lines)
**Props:** `{ icon, iconColor?, title, subtitle?, defaultExpanded?, isActive?, children }`
**Features:** Spring height animation (d20 m1 s180) via Reanimated. Measures content height on layout, interpolates between 0 and measured. Chevron rotation (0 -> 90 degrees). Header press feedback (scale 0.97 spring). Active state: emerald icon + text. Opacity fade during expand (0 -> 0.5 -> 1 interpolated with height). Content positioned absolute for measurement.

### 4.14 RichCaptionInput
**File:** `components/ui/RichCaptionInput.tsx` (240 lines)
**Props:** `{ value, onChangeText, placeholder?, maxLength?, multiline?, autoFocus?, minHeight?, accessibilityLabel?, onTriggerAutocomplete?, onDismissAutocomplete?, style? }`
**Features:** `forwardRef` with `focus()` and `blur()` methods. Dual-layer architecture: transparent TextInput for editing + colored Text overlay for syntax highlighting. Tokenizer colors: #hashtags=emerald, @mentions=blue, URLs=gold. Autocomplete trigger detection (# or @ at cursor). Focus indicator (emerald line at bottom, FadeIn).

### 4.15 UploadProgressBar + uploadWithProgress
**File:** `components/ui/UploadProgressBar.tsx` (214 lines)
**Props:** `{ progress (0-100), visible, label?, onCancel? }`
**Features:** Spring-animated fill width. Emerald->gold gradient fill (during upload), emerald->emeraldLight (when complete). Check-circle icon at 100%. Cancel button. FadeIn/FadeOut entrance/exit.
**Also exports:** `uploadWithProgress(url, blob, contentType, onProgress)` -> `{ promise, abort }`. Uses XMLHttpRequest (not fetch) for upload progress tracking. PUT method with Content-Type header.

### 4.16 CreateSheet + CreateHeaderButton
**File:** `components/ui/CreateSheet.tsx` (436 lines)
**Props:** `{ visible, onClose }`
**Features:** 8 create options: Post, Story, Reel, Thread, Carousel, Long Video, Go Live, Voice Post. Top 4 as gradient grid cards (2x2), bottom 4 as compact rows. Each with unique color + gradient. Staggered FadeInDown entrance (80ms per item). Spring press (0.92 for grid, 0.97 for rows). Glow accent circles on grid cards. Shadow depth on grid cards.
**CreateHeaderButton:** Emerald gradient "+" pill with press sequence animation (0.8 -> 1 bounce).

### 4.17 ImageCarousel
**File:** `components/ui/ImageCarousel.tsx` (290 lines)
**Props:** `{ images, texts?, height?, showIndicators?, onImagePress?, borderRadius?, blurred? }`
**Features:** Instagram-style dot indicators: max 5 visible, sliding window, active dot stretches to 20px width, edge dots scale to 0.6. Glass pill count badge (top-right) with BlurView. Adjacent image prefetch on scroll. Per-slide text overlay with gradient backdrop. FlatList with pagingEnabled + snapToInterval. `memo()` wrapped.

### 4.18 LocationPicker
**File:** `components/ui/LocationPicker.tsx` (334 lines)
**Props:** `{ visible, onClose, onSelect }`
**Features:** BottomSheet at 70% snap. Search input with debounce (300ms). Real `expo-location` geocoding + reverse geocoding for search results. "Use Current Location" with permission request + reverse geocode for human-readable name. 10 popular Islamic locations hardcoded (Masjid al-Haram, Masjid an-Nabawi, Al-Aqsa, Blue Mosque, etc.). Skeleton loading state.

### 4.19 SchedulePostSheet
**File:** `components/ui/SchedulePostSheet.tsx` (237 lines)
**Props:** `{ visible, onClose, onSchedule, onClearSchedule?, currentSchedule? }`
**Features:** Date picker (horizontal scroll, 14 days out, today/tomorrow labels). Time picker (30-min intervals, 48 slots). Past times disabled for today. Summary card showing selected date+time. Clear schedule option. Regenerates dates when sheet opens. Past validation prevents scheduling in the past.

### 4.20 VideoPlayer
**File:** `components/ui/VideoPlayer.tsx` (649 lines)
**Props:** `{ uri, hlsUrl?, thumbnailUrl?, duration?, qualities?, isLooping?, autoPlay?, enablePiP?, enableAmbient?, onProgress?, onComplete?, onPiPEnter? }`
**Features:** `memo()` wrapped. Prefers HLS URL (adaptive bitrate) over raw R2 URL. Double-tap left/right to seek back/forward 10s with animated indicator. Composed gesture (double-tap exclusive with single-tap). Playback speed (0.25/0.5/1/1.25/1.5/2x). Quality selector (auto + specific qualities). Loop toggle. Volume/mute control. Seek bar with buffered progress indicator. Fullscreen with landscape orientation lock (expo-screen-orientation). Ambient gradient background (useAmbientColor from thumbnail). PiP support (usePiP). Skeleton loading + buffering states. Auto-hide controls after 3s.

### 4.21 Other UI Components (brief)

| Component | File | Key Props | Features |
|-----------|------|-----------|----------|
| **WebSafeBlurView** | WebSafeBlurView.tsx | BlurView props | Wraps expo-blur BlurView with web fallback |
| **FadeIn** | FadeIn.tsx | children, delay? | Simple fade-in wrapper |
| **VerifiedBadge** | VerifiedBadge.tsx | size? | Blue check icon |
| **TabBarIndicator** | TabBarIndicator.tsx | index, count | Animated tab indicator line |
| **EndScreenOverlay** | EndScreenOverlay.tsx | endScreens, videoId | YouTube-style end cards |
| **SocialProof** | SocialProof.tsx | avatars[], count, label | "X and Y others" avatar row |
| **TabSelector** | TabSelector.tsx | tabs, selected, onSelect | Horizontal tab buttons |
| **OfflineBanner** | OfflineBanner.tsx | — | Shows when isOffline in store |
| **ImageLightbox** | ImageLightbox.tsx | images, visible, onClose | Fullscreen image viewer |
| **Badge** | Badge.tsx | count, color? | Numeric badge circle |
| **ScreenErrorBoundary** | ScreenErrorBoundary.tsx | children | Error boundary with retry |
| **AuthGate** | AuthGate.tsx | children | Redirects to auth if not signed in |
| **ActionButton** | ActionButton.tsx | icon, label, onPress | Icon + label pressable |
| **DoubleTapHeart** | DoubleTapHeart.tsx | onDoubleTap | Instagram-style double-tap heart |
| **CaughtUpCard** | CaughtUpCard.tsx | — | "You're all caught up" feed card |
| **PremiereCountdown** | PremiereCountdown.tsx | scheduledAt | Video premiere countdown timer |
| **FloatingHearts** | FloatingHearts.tsx | count | Animated floating heart bubbles |
| **VideoControls** | VideoControls.tsx | — | Standalone video control bar |
| **ReactionPicker** | ReactionPicker.tsx | onSelect | LIKE/LOVE/SUPPORT/INSIGHTFUL picker |
| **ForceUpdateModal** | ForceUpdateModal.tsx | — | App update required modal |
| **EmojiPicker** | EmojiPicker.tsx | onSelect | Emoji selection grid |
| **Autocomplete** | Autocomplete.tsx | query, onSelect | Generic autocomplete dropdown |
| **ImageGallery** | ImageGallery.tsx | images, onSelect | Grid image gallery |
| **LinkPreview** | LinkPreview.tsx | url | URL preview card (title, image, domain) |
| **MentionAutocomplete** | MentionAutocomplete.tsx | query, onSelect | @mention user autocomplete |
| **MiniPlayer** | MiniPlayer.tsx | — | Persistent video mini-player bar |
| **TTSMiniPlayer** | TTSMiniPlayer.tsx | — | TTS playback controls mini-bar |

---

## 5. NON-UI COMPONENTS (components/ subdirectories)

### 5.1 Saf (Feed)
| Component | File | Purpose |
|-----------|------|---------|
| **PostCard** | saf/PostCard.tsx | Full feed post card with media, actions, reactions |
| **PostMedia** | saf/PostMedia.tsx | Post media renderer (images, video, carousel) |
| **StoryRow** | saf/StoryRow.tsx | Horizontal story bubbles row |
| **StoryBubble** | saf/StoryBubble.tsx | Individual story avatar ring |

### 5.2 Majlis (Threads)
| Component | File | Purpose |
|-----------|------|---------|
| **ThreadCard** | majlis/ThreadCard.tsx | Thread card with replies, repost, poll |

### 5.3 Bakra (Reels)
| Component | File | Purpose |
|-----------|------|---------|
| **CommentsSheet** | bakra/CommentsSheet.tsx | Reel comments bottom sheet |

### 5.4 Risalah (Messaging)
| Component | File | Purpose |
|-----------|------|---------|
| **TypingIndicator** | risalah/TypingIndicator.tsx | Animated typing dots |
| **VoiceWaveform** | risalah/VoiceWaveform.tsx | Voice message waveform visualization |
| **StickerPicker** | risalah/StickerPicker.tsx | Sticker pack browser + picker |
| **StickerPackBrowser** | risalah/StickerPackBrowser.tsx | Browse sticker packs |

### 5.5 Story Stickers (10 interactive types)
| Component | File | Purpose |
|-----------|------|---------|
| **PollSticker** | story/PollSticker.tsx | Spring percentage bars, haptic vote |
| **QuizSticker** | story/QuizSticker.tsx | 24 ticker-tape confetti, haptic success/error |
| **QuestionSticker** | story/QuestionSticker.tsx | Immediate optimistic submit |
| **CountdownSticker** | story/CountdownSticker.tsx | All strings i18n'd |
| **SliderSticker** | story/SliderSticker.tsx | Haptic ticks at quarter marks |
| **LocationSticker** | story/LocationSticker.tsx | Real GPS + reverse geocode gradient pill |
| **LinkSticker** | story/LinkSticker.tsx | URL truncation, favicon, See More CTA |
| **AddYoursSticker** | story/AddYoursSticker.tsx | Participant count, chain entry |
| **GifSticker** | story/GifSticker.tsx | Waterfall masonry + GIPHY native SDK |
| **MusicSticker** | story/MusicSticker.tsx | Compact/waveform/lyrics, word-by-word highlighting |
| **MusicPicker** | story/MusicPicker.tsx | Genre search, preview, track selection |
| **TextEffects** | story/TextEffects.tsx | Text style presets for story overlays |
| **DrawingCanvas** | story/DrawingCanvas.tsx | Freehand/highlighter/neon/eraser drawing |

### 5.6 Editor
| Component | File | Purpose |
|-----------|------|---------|
| **VideoTimeline** | editor/VideoTimeline.tsx | Trim handles, playhead visualization |
| **VideoTransitions** | editor/VideoTransitions.tsx | Transition type selector (8 types) |

### 5.7 Web
| Component | File | Purpose |
|-----------|------|---------|
| **WebSidebar** | web/WebSidebar.tsx | Desktop sidebar navigation |
| **WebLayout** | web/WebLayout.tsx | Desktop layout wrapper |

### 5.8 Islamic
| Component | File | Purpose |
|-----------|------|---------|
| **EidFrame** | islamic/EidFrame.tsx | Eid celebration decorative frame |

### 5.9 Other Top-Level Components
| Component | File | Purpose |
|-----------|------|---------|
| **ErrorBoundary** | ErrorBoundary.tsx | Global error boundary |
| **AlgorithmCard** | AlgorithmCard.tsx | Feed algorithm debug card |
| **ContactMessage** | ContactMessage.tsx | Contact sharing message bubble |
| **LocationMessage** | LocationMessage.tsx | Location sharing message bubble |
| **ReminderButton** | ReminderButton.tsx | Event reminder toggle |
| **GiftOverlay** | GiftOverlay.tsx | Gift animation overlay |
| **PinnedMessageBar** | PinnedMessageBar.tsx | Pinned message banner in chat |
| **VideoReplySheet** | VideoReplySheet.tsx | Video reply bottom sheet |
| **ViewOnceMedia** | ViewOnceMedia.tsx | Self-destructing media viewer |

---

## 6. TYPES

**File:** `apps/mobile/src/types/index.ts` (1,040 lines)

### 6.1 Core Entity Interfaces

| Interface | Key Fields | Used By |
|-----------|-----------|---------|
| **User** | id, username, displayName, bio?, avatarUrl?, coverUrl?, isVerified, isPrivate, isCreator?, followersCount?, followingCount?, isFollowing?, isFollowedBy?, channel?, profileLinks? | All spaces |
| **Post** | id, postType (IMAGE/CAROUSEL/VIDEO/TEXT/LINK), content?, visibility (PUBLIC/FOLLOWERS/CIRCLE), mediaUrls[], mediaTypes[], hashtags[], mentions[], likesCount, commentsCount, commentPermission? (EVERYONE/FOLLOWERS/NOBODY), brandedContent?, topics?, altText?, scheduledAt?, user, userReaction?, isSaved? | Saf |
| **Thread** | id, content, mediaUrls[], visibility, replyPermission? (everyone/following/mentioned/none), isChainHead, chainPosition, isQuotePost, poll?, repostOf?, hashtags[], mentions[], likesCount, repliesCount, repostsCount, quotesCount, user, userReaction?, isBookmarked? | Majlis |
| **ThreadReply** | id, content, mediaUrls[], likesCount, isLiked?, parentId?, user | Majlis |
| **Reel** | id, videoUrl, streamId?, hlsUrl?, thumbnailUrl?, duration, caption?, status (PROCESSING/READY/FAILED), isDuet, isStitch, isPhotoCarousel?, carouselUrls?, carouselTexts?, audioTrack?, isTrial?, scheduledAt?, likesCount, commentsCount, user | Bakra |
| **Video** | id, title, description?, videoUrl, streamId?, hlsUrl?, thumbnailUrl?, duration, category (12 types), tags[], chapters?, viewsCount, likesCount, dislikesCount, commentsCount, status (DRAFT/PROCESSING/PUBLISHED/UNLISTED/PRIVATE), user, channel | Minbar |
| **Channel** | id, handle, name, description?, avatarUrl?, bannerUrl?, subscribersCount, videosCount, totalViews, isVerified, trailerVideo?, user, isSubscribed? | Minbar |
| **Message** | id, content?, messageType (10 types), mediaUrl?, voiceDuration?, replyToId?, isForwarded, isDeleted, isScheduled?, starredBy?, editedAt?, sender, replyTo?, reactions?, isPinned?, expiresAt?, isSpoiler?, isViewOnce? | Risalah |
| **Conversation** | id, isGroup, groupName?, groupAvatarUrl?, disappearingDuration?, lastMessageText?, lastMessageAt?, members[], otherUser?, isMuted?, isArchived?, unreadCount? | Risalah |
| **Notification** | id, type (16 types), postId/threadId/reelId/videoId?, isRead, actor?, post?, reel?, thread?, video? | All |

### 6.2 Supporting Interfaces

| Interface | Purpose |
|-----------|---------|
| **Story** | Story media with sticker data, close friends/subscribers only, expiry |
| **StoryGroup** | User + stories array + hasUnread |
| **StoryHighlightAlbum** | Highlight album with position, cover, stories |
| **Poll** | Question + options array + total votes + allowMultiple |
| **PollOption** | Text + votesCount + position + percentage |
| **Comment** | Content + likes + isPinned + replies count |
| **Circle** | Name + slug + emoji + description + members count |
| **CircleMember** | User + role + joinedAt |
| **ProfileLink** | Title + URL + position |
| **FollowRequest** | Follower user + createdAt |
| **TrendingHashtag** | Name + posts/threads counts |
| **BlockedKeyword** | Word + createdAt |
| **ConversationMember** | User + lastReadAt + unreadCount + isMuted + isArchived + tag? |
| **MessageReaction** | Emoji + userId |
| **VideoComment** | Content + likes + timestamp? + isPinned + replies count |
| **VideoChapter** | Title + startTime (seconds) |
| **Playlist** | Title + description + isPublic + isCollaborative + collaborators |
| **PlaylistItem** | Position + video (title, thumbnail, duration, channel) |
| **PlaylistCollaborator** | UserId + role (editor/viewer) |
| **WatchHistoryItem** | Video fields + progress + completed + watchedAt |
| **BroadcastChannel** | Name + slug + subscribers/posts counts + role |
| **BroadcastMessage** | Content + mediaUrls + isPinned + viewsCount |
| **LiveSession** | Title + status (scheduled/live/ended/cancelled) + liveType + viewers |
| **LiveParticipant** | User + role (host/speaker/viewer) + handRaised |
| **CallSession** | callType (voice/video) + status (ringing/active/ended/missed/declined) |
| **StickerPack** | Name + slug + stickers array + isOfficial + downloadCount |
| **StickerItem** | imageUrl + emoji? |
| **PostCollab** | Status (pending/accepted/declined) + invitedBy |
| **ChannelPost** | Community post with postType (text/image/poll/quiz) |
| **AudioTrack** | Title + artist + coverUrl + duration + usageCount + isTrending + genre |
| **MajlisList** | List name + isPublic + membersCount |
| **SubtitleTrack** | Label + language + srtUrl |
| **ScheduledItem** | Type (post/thread/reel/video) + scheduledAt |
| **HashtagInfo** | Posts/reels/threads/videos counts |
| **BookmarkCollection** | Name + count + thumbnail |
| **WatchLaterItem** | Video fields + addedAt |
| **DMNote** | Content + expiresAt |
| **SearchSuggestion** | Type + name + avatar + count |
| **OfflineDownload** | ContentType + quality + fileSize + status + progress + filePath |
| **ParentalControl** | Full control settings (restrictedMode, maxAgeRating, dailyLimit, etc.) |
| **ParentalRestrictions** | Subset for store (isLinked, restrictedMode, etc.) |
| **VideoPremiere** | ScheduledAt + chatEnabled + reminderCount + viewerCount |
| **VideoClip** | Start/endTime + duration + clipUrl + source video |
| **EndScreen** | Type (subscribe/watch_next/playlist/link) + targetId + showAtSeconds |

### 6.3 AI Interfaces
| Interface | Purpose |
|-----------|---------|
| **AiCaptionSuggestion** | caption + tone (casual/professional/funny/inspirational) |
| **AiModerationResult** | safe + flags[] + confidence + suggestion + category |
| **AiSmartReply** | text + tone (friendly/formal/emoji/brief) |
| **AiSpaceRouting** | recommendedSpace + confidence + reason |
| **AiTranslation** | targetLanguage + translatedText |
| **AiCaption** | Video caption SRT with status (pending/processing/complete/failed) |
| **AiAvatar** | AI-generated avatar with source + style |

### 6.4 Enums/Unions
| Type | Values |
|------|--------|
| PostType | IMAGE, CAROUSEL, VIDEO, TEXT, LINK |
| Visibility | PUBLIC, FOLLOWERS, CIRCLE |
| ReactionType | LIKE, LOVE, SUPPORT, INSIGHTFUL |
| MessageType | TEXT, IMAGE, VIDEO, AUDIO, VOICE, FILE, GIF, STICKER, LOCATION, SYSTEM |
| VideoStatus | DRAFT, PROCESSING, PUBLISHED, UNLISTED, PRIVATE |
| VideoCategory | EDUCATION, QURAN, LECTURE, VLOG, NEWS, DOCUMENTARY, ENTERTAINMENT, SPORTS, COOKING, TECH, OTHER |
| NotificationType | LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, FOLLOW_REQUEST_ACCEPTED, MENTION, REPLY, CIRCLE_INVITE, CIRCLE_JOIN, MESSAGE, THREAD_REPLY, REPOST, QUOTE_POST, CHANNEL_POST, LIVE_STARTED |
| ReportStatus | PENDING, REVIEWING, RESOLVED, DISMISSED |
| ReportReason | HATE_SPEECH, HARASSMENT, VIOLENCE, SPAM, MISINFORMATION, NUDITY, SELF_HARM, TERRORISM, DOXXING, COPYRIGHT, IMPERSONATION, OTHER |
| ModerationAction | WARNING, CONTENT_REMOVED, TEMP_MUTE, TEMP_BAN, PERMANENT_BAN, NONE |
| SearchSuggestionType | user, hashtag, post, thread, reel, video |

### 6.5 Generic Types
- `PaginatedResponse<T>` -> `{ data: T[], meta: { cursor: string | null, hasMore: boolean } }`
- `Settings` -> isPrivate, notify*, sensitiveContent, reducedMotion, dailyTimeLimit?
- `AdminStats` -> users, posts, threads, reels, videos, pendingReports
- `SuggestedUser` -> Standard user fields + mutualFollowers
- `CreatorStat` -> Date + space + views/likes/comments/shares/followers
- `Report` -> Full moderation report with reporter, reported, status, action, notes
- `ModerationLogEntry` -> Moderator action log with appeal tracking
- `BlockedUser`, `MutedUser` -> User reference with blocked/muted relation
- `FeedDismissal` -> Content dismissal with reason
