# M05 -- Calls & Audio Screens Hostile Audit

**Scope:** 10 files in `apps/mobile/app/(screens)/`
- `call-history.tsx` (302 lines)
- `audio-room.tsx` (983 lines)
- `quran-room.tsx` (592 lines)
- `watch-party.tsx` (403 lines)
- `audio-library.tsx` (735 lines)
- `voice-recorder.tsx` (359 lines)
- `voice-post-create.tsx` (243 lines)
- `nasheed-mode.tsx` (249 lines)
- `go-live.tsx` (423 lines)
- `schedule-live.tsx` (529 lines)

**Auditor:** Claude Opus 4.6
**Date:** 2026-04-05

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| High     | 11    |
| Medium   | 19    |
| Low      | 14    |
| Info     | 7     |
| **Total**| **54**|

---

## Critical

### C01 -- audio-room.tsx: Styles use hardcoded dark-mode colors, broken in light theme
**File:** `audio-room.tsx`
**Lines:** 673, 689, 749, 754, 781, 785, 793, 827, 831, 843, 848, 861, 871, 880, 889, 894, 910, 915, 926, 928, 933, 975
**Detail:** The entire stylesheet at line 654+ uses `colors.text.primary`, `colors.text.secondary`, `colors.text.tertiary`, `colors.dark.surface`, `colors.dark.bg`, `colors.dark.border`, and `colors.dark.bgElevated` directly instead of `tc.*` theme tokens. The `tc` variable exists (line 62) but is only used in JSX for a handful of elements. All 22+ stylesheet references bypass the theme system entirely. On a light theme, every text color, background, and border will be dark-on-dark -- completely unreadable.
**Rule violated:** `.claude/rules/mobile-screens.md` -- "NEVER `colors.dark.*` in JSX directly", `useThemeColors() -> tc.*`

### C02 -- audio-room.tsx: fetchData callback missing `t` dependency -- stale error message
**File:** `audio-room.tsx`
**Lines:** 93-111
**Detail:** `fetchData` at line 93 uses `t('audioRoom.failedToLoad')` on line 104 and `showToast` on line 105, but the `useCallback` dependency array at line 110 is `[id]`. If the language changes while the component is mounted, error messages will display in the stale language. More importantly, this is a React hooks exhaustive-deps violation.

### C03 -- voice-post-create.tsx: startRecording callback missing all dependencies
**File:** `voice-post-create.tsx`
**Lines:** 54-96
**Detail:** `startRecording` at line 54 uses `t`, `haptic`, `pulseScale`, and `durationRef`, but the dependency array at line 96 is empty `[]`. On fast re-renders or language changes, the callback captures stale references. The `t` function will be permanently stale, so all error messages from recording failures (line 93) will use the initial language.

---

## High

### H01 -- audio-room.tsx: No audio/WebRTC cleanup on unmount
**File:** `audio-room.tsx`
**Lines:** 60-651
**Detail:** The entire audio room screen has no `useEffect` cleanup for the audio room session itself. The polling interval at line 121 is properly cleaned (line 122), but there is no cleanup for the actual audio room participation. When the user navigates away without pressing "Leave", the participant stays in the room indefinitely. There is no `onBeforeRemove` navigation listener to warn or auto-leave.

### H02 -- audio-room.tsx: Hardcoded fallback string 'User' not i18n-wrapped
**File:** `audio-room.tsx`
**Lines:** 158, 167, 177
**Detail:** Three instances of `p.user.name || p.user.username || 'User'` use a hardcoded English fallback instead of `t('common.unknownUser')` or similar. This breaks in all 7 non-English languages.

### H03 -- audio-room.tsx: Reaction handler is a no-op (never sent to server)
**File:** `audio-room.tsx`
**Lines:** 286-291
**Detail:** `handleReaction` at line 286 shows a toast saying "Reaction sent!" but never actually emits the reaction to a socket or API. The TODO comment at line 290 confirms this. The user sees success feedback for an action that does nothing -- this is a lie to the user.

### H04 -- quran-room.tsx: Audio Sound not cleaned up on verse change race condition
**File:** `quran-room.tsx`
**Lines:** 139-145
**Detail:** The `useEffect` at line 139 that stops audio on verse change calls `soundRef.current.stopAsync().then(() => soundRef.current?.unloadAsync()).catch(() => {})` and then immediately sets `soundRef.current = null` on line 142. The `.then()` callback still references `soundRef.current` which is already `null` by that point, so `unloadAsync()` is never called. The Sound object leaks.

### H05 -- audio-library.tsx: WaveformBar mutates shared value on every render (no effect guard)
**File:** `audio-library.tsx`
**Lines:** 64-76
**Detail:** The `WaveformBar` component directly sets `anim.value` in the render body (line 68-75) without a `useEffect`. Every re-render triggers a new animation assignment. With 8 bars per track and potentially 20+ visible tracks, this causes hundreds of redundant animation restarts per render cycle. This is both a correctness issue (animation stutters) and a performance issue.

### H06 -- audio-library.tsx: Category filter doesn't actually filter by category
**File:** `audio-library.tsx`
**Lines:** 190-217
**Detail:** `useInfiniteQuery` at line 198 includes `activeCategory` in the queryKey (line 199), but `audioTracksApi.getTrending(pageParam)` at line 201 never passes the category to the API. The query refetches when category changes (new key = cache miss), but the API returns the same data regardless. The client-side filter at lines 212-217 only filters by `searchQuery` and `favoritesOnly`, never by `activeCategory`. Category pills are purely cosmetic.

### H07 -- voice-recorder.tsx: Recording timer uses setInterval without ref for accumulated drift
**File:** `voice-recorder.tsx`
**Lines:** 70-78
**Detail:** The timer at line 71 uses `setInterval` incrementing a local `timeRef.value` by 1 every 1000ms. `setInterval` is not guaranteed to fire exactly every 1000ms (JS event loop, GC pauses). Over a 5-minute recording, the displayed time can drift 2-5 seconds from actual recording duration. Should use `Date.now()` difference for accurate elapsed time.

### H08 -- voice-recorder.tsx: send() does not pass the uploaded URL back to caller
**File:** `voice-recorder.tsx`
**Lines:** 144-159
**Detail:** The `send` function uploads the recording to R2 and gets a `presign.publicUrl`, but then just calls `router.back()` without passing the URL to the previous screen. The voice message is uploaded but never associated with any message or conversation. The upload is effectively lost.

### H09 -- watch-party.tsx: "LIVE" text hardcoded in English
**File:** `watch-party.tsx`
**Line:** 167
**Detail:** `<Text style={styles.liveText}>LIVE</Text>` is hardcoded English. Should be `t('community.live')` or similar.

### H10 -- go-live.tsx: No camera/microphone permission request before going live
**File:** `go-live.tsx`
**Lines:** 110-114
**Detail:** `handleGoLive` creates a live stream without requesting camera or microphone permissions first. For a VIDEO type stream, the user needs camera + mic permissions; for AUDIO, mic permissions. The screen proceeds to `/(screens)/live/${live.id}` which will either crash or show a blank stream if permissions are denied.

### H11 -- schedule-live.tsx: Schedule date can be set in the past
**File:** `schedule-live.tsx`
**Lines:** 75-91, 94-101
**Detail:** The native `DateTimePicker` at line 322 sets `minimumDate={new Date()}`, but the custom fallback chip picker (lines 331-389) has no minimum date validation. A user on Expo Go can select a past date+hour+minute combination. The chip picker shows "next 7 days" starting from today, but the hour/minute selection at lines 354-367 allows selecting times already passed today. No validation occurs before submitting at line 169.

---

## Medium

### M01 -- call-history.tsx: onPress returns undefined instead of void
**File:** `call-history.tsx`
**Line:** 111
**Detail:** `onPress={() => otherUser?.username ? navigate(...) : undefined}` -- when `otherUser?.username` is falsy, the press handler explicitly returns `undefined` instead of doing nothing (no-op). While functionally harmless, this is a confusing pattern and the press still registers (ripple effect, haptic if any) with no navigation.

### M02 -- call-history.tsx: FlatList missing initialNumToRender and windowSize tuning
**File:** `call-history.tsx`
**Lines:** 198-222
**Detail:** The `FlatList` at line 198 has `removeClippedSubviews={true}` but no `initialNumToRender`, `maxToRenderPerBatch`, or `windowSize` props. For call history that could have hundreds of entries, this leads to over-rendering on first load.

### M03 -- audio-room.tsx: More-horizontal menu button does nothing
**File:** `audio-room.tsx`
**Line:** 333
**Detail:** `rightAction={{ icon: 'more-horizontal', onPress: () => {} }}` is a button that does nothing when pressed. It's visible and tappable but has no functionality.

### M04 -- audio-room.tsx: Mic/hand toggle accessibility labels are generic
**File:** `audio-room.tsx`
**Lines:** 559, 575
**Detail:** Both the mic toggle (line 559) and hand raise (line 575) buttons use `t('accessibility.toggleSwitch')` as their accessibility label. Screen readers will announce both buttons identically -- users can't tell them apart.

### M05 -- quran-room.tsx: Error state reset only clears error, does not refetch
**File:** `quran-room.tsx`
**Lines:** 261-279
**Detail:** The error state's retry action at line 275 calls `setError(null)` which clears the error display, but doesn't trigger a refetch of the room data or verse. The user sees the loading state again but nothing actually loads because the socket events need to re-fire.

### M06 -- quran-room.tsx: SURAH_OFFSETS array not validated for bounds
**File:** `quran-room.tsx`
**Lines:** 49-60, 62-66
**Detail:** `getQuranAudioUrl` at line 62 accesses `SURAH_OFFSETS[surah - 1]` with `?? 0` fallback. If `surah` is 0, negative, or > 114, it silently returns a URL with `audioNumber = 0 + ayah`, which points to the wrong audio file. No validation or error for out-of-range surah/verse values.

### M07 -- quran-room.tsx: Socket connection status dot has hardcoded 'Connected'/'Disconnected' labels
**File:** `quran-room.tsx`
**Lines:** 303-304
**Detail:** `accessibilityLabel: isConnected ? 'Connected' : 'Disconnected'` at line 304 is hardcoded English, not wrapped in `t()`.

### M08 -- quran-room.tsx: Host FAB accessibility label is misleading
**File:** `quran-room.tsx`
**Line:** 425
**Detail:** `accessibilityLabel={t('accessibility.openFilter')}` for the host controls button. This button opens verse navigation controls (next/prev verse), not a filter.

### M09 -- watch-party.tsx: Double navigation on card press and join button
**File:** `watch-party.tsx`
**Lines:** 155-161, 188-194
**Detail:** Both the card press (line 158) and the "Join" button (line 193) navigate to the same URL. The `isNavigatingRef` guard (lines 156-160, 189-194) uses `setTimeout(() => { isNavigatingRef.current = false; }, 500)` which leaks if the component unmounts within 500ms. No cleanup for these timeouts.

### M10 -- watch-party.tsx: Unchecked type assertions throughout renderParty
**File:** `watch-party.tsx`
**Lines:** 146-215
**Detail:** `renderParty` casts `item.host as Record<string, unknown>`, `item.title as string`, `item.id as string`, `item.viewerCount as number`, `item.isActive as boolean` without any runtime validation. If the API response shape changes, this silently produces wrong data or crashes.

### M11 -- audio-library.tsx: toggleFavorite is purely cosmetic -- no API call, no state update
**File:** `audio-library.tsx`
**Lines:** 288-291
**Detail:** `toggleFavorite` shows a toast saying "Favorite toggled" but never calls any API and never updates `isFavorite` on the track (which is always `false` per `mapApiTrack` at line 59). The heart icon will never fill.

### M12 -- audio-library.tsx: styles defined outside component are not theme-aware
**File:** `audio-library.tsx`
**Lines:** 487-734
**Detail:** The `styles` StyleSheet at line 487 is defined at module level (outside the component), not using `createStyles(tc)` like other screens. It uses hardcoded `rgba()` values and `colors.active.*` tokens but never `tc.*`. Theme changes will not affect these styles.

### M13 -- voice-post-create.tsx: No playback preview before posting
**File:** `voice-post-create.tsx`
**Lines:** 144-223
**Detail:** The screen lets users record and post immediately. There is `recordingUri` state but no playback functionality -- the user cannot listen to what they recorded before publishing. The waveform shows a static sine wave pattern (line 166) after recording, implying playback, but it's purely decorative.

### M14 -- voice-post-create.tsx: Recording not cleaned up if user navigates away mid-recording
**File:** `voice-post-create.tsx`
**Lines:** 44-52
**Detail:** The cleanup effect at lines 44-52 handles `recordingRef.current` on unmount, but only via `.catch(() => {})`. If the user is actively recording and swipes back (React Navigation gesture), `stopAndUnloadAsync` is called but `intervalRef.current` interval is also cleared. However, there's no `onBeforeRemove` listener to warn the user they'll lose their recording.

### M15 -- nasheed-mode.tsx: SAMPLE_NASHEEDS titles and artists are hardcoded English strings
**File:** `nasheed-mode.tsx`
**Lines:** 20-25
**Detail:** `{ title: 'Tala al-Badru Alayna', artist: 'Traditional' }` etc. While nasheed titles could be considered proper nouns, the word "Traditional" at line 21 is English that should be `t('nasheed.traditional')`. Additionally, the entire list is static placeholder data with no API backing.

### M16 -- nasheed-mode.tsx: Optimistic revert on mutation error may flash wrong state
**File:** `nasheed-mode.tsx`
**Lines:** 37-42
**Detail:** `onError` at line 39 calls `setNasheedMode(!nasheedMode)` but `nasheedMode` is captured from the render when the mutation was defined, not when the error occurs. If the user toggles multiple times rapidly, the revert will use a stale value.

### M17 -- go-live.tsx: Date picker is a placeholder with no actual date selection
**File:** `go-live.tsx`
**Lines:** 297-309
**Detail:** The date picker bottom sheet at line 297 contains a placeholder text "Select a date and time" and a confirm button that submits `tempDate` (which is initialized to `new Date()` at line 56 and never updated by user interaction in this sheet). The user cannot actually pick a date -- confirming always selects the initial default.

### M18 -- schedule-live.tsx: Uploading state manually managed alongside mutation state
**File:** `schedule-live.tsx`
**Lines:** 82, 128-129, 146-147, 160-161
**Detail:** `uploading` state (line 82) is manually set in `mutationFn` (lines 128, 146) and `onError` (line 160). This duplicates `scheduleMutation.isPending` and can desync. If the mutation is cancelled or the component unmounts during upload, `setUploading(false)` may be called on an unmounted component (React warning).

### M19 -- schedule-live.tsx: ImagePicker.launchImageLibraryAsync has no error handling
**File:** `schedule-live.tsx`
**Lines:** 104-121
**Detail:** `pickThumbnail` at line 104 calls `ImagePicker.launchImageLibraryAsync` without try/catch. If the user denies photo library permissions, this throws an unhandled exception that crashes the screen.

---

## Low

### L01 -- call-history.tsx: formatDistanceToNowStrict may crash on invalid dates
**File:** `call-history.tsx`
**Line:** 132
**Detail:** `new Date(item.createdAt)` will produce `Invalid Date` if `createdAt` is null/undefined/malformed. `formatDistanceToNowStrict` will then throw. No defensive check.

### L02 -- audio-room.tsx: Alert.alert used for destructive confirmations (acceptable per rules)
**File:** `audio-room.tsx`
**Lines:** 217, 265
**Detail:** `Alert.alert` for leave-room and end-room confirmations is acceptable (destructive actions). Noting for completeness -- these are correctly using Alert for destructive confirmation, not for feedback.

### L03 -- audio-room.tsx: No loading/pending state shown for accept/decline hand actions
**File:** `audio-room.tsx`
**Lines:** 242-259
**Detail:** `handleAcceptHand` and `handleDeclineHand` don't set `actionPending` so the user can rapid-fire accept/decline multiple hands simultaneously, causing race conditions on the server.

### L04 -- quran-room.tsx: loadingVerse used as refreshControl's refreshing prop
**File:** `quran-room.tsx`
**Lines:** 312-313
**Detail:** `refreshing={loadingVerse}` ties the refresh spinner to verse loading state. Pull-to-refresh shows spinner during any verse load (including socket-triggered ones), not just user-initiated refreshes.

### L05 -- watch-party.tsx: FlatList inside BottomSheet (video picker) has fixed maxHeight
**File:** `watch-party.tsx`
**Line:** 395
**Detail:** `videoList: { maxHeight: 360 }` is a hardcoded pixel value that doesn't adapt to screen size. On small phones (iPhone SE), this may overflow. On iPads, it wastes space.

### L06 -- audio-library.tsx: `allTracks.find(t => t.id === currentTrackId)` shadows the `t` translation function
**File:** `audio-library.tsx`
**Lines:** 421, 424
**Detail:** The `.find(t => t.id === ...)` callback parameter `t` shadows the outer `t` from `useTranslation()`. While not a bug (it's in a different scope), it's confusing and violates clean code practices.

### L07 -- voice-recorder.tsx: levels array grows and shifts every 100ms during recording
**File:** `voice-recorder.tsx`
**Lines:** 86-89
**Detail:** `setLevels((l) => { const updated = [...l, normalized]; if (updated.length > 20) updated.shift(); return updated; })` creates a new array every 100ms by spreading + shifting. For 5 minutes of recording, that's 3,000 allocations. Should use a ring buffer or fixed-size array with index.

### L08 -- voice-recorder.tsx: Inconsistent i18n key prefixes
**File:** `voice-recorder.tsx`
**Lines:** 55, 155
**Detail:** Line 55 uses `t('screens.voiceRecorder.microphoneRequired')` but line 155 uses `t('voiceRecorder.uploadFailed')` (no `screens.` prefix). Inconsistent key naming will cause missing translations if only one prefix pattern exists in translation files.

### L09 -- voice-post-create.tsx: Dimensions import unused
**File:** `voice-post-create.tsx`
**Line:** 3
**Detail:** `import { ... Dimensions } from 'react-native'` -- `Dimensions` is imported but never used.

### L10 -- go-live.tsx: tempDate is never updated by user in the date picker
**File:** `go-live.tsx`
**Lines:** 56, 299-308
**Detail:** `tempDate` initialized at line 56 as `new Date()`. The date picker sheet (lines 297-309) has no UI for the user to change the date -- the "confirm" button just calls `handleDateSelect(tempDate)` with the original value. Identical to M17 but calling out the specific unused state.

### L11 -- schedule-live.tsx: dayOptions computed with useMemo but no dependency
**File:** `schedule-live.tsx`
**Line:** 86
**Detail:** `useMemo(() => generateDayOptions(), [])` generates day options once on mount. If the component stays mounted past midnight, the day options become stale (today becomes yesterday).

### L12 -- audio-library.tsx: CATEGORIES array is hardcoded English
**File:** `audio-library.tsx`
**Lines:** 30-32
**Detail:** `const CATEGORIES = ['Trending', 'Islamic', 'Nasheeds', 'Lo-fi', 'Acoustic', 'Hip Hop', 'Pop', 'Qiraat']` -- the display label at line 371 uses `t('audioLibrary.category.${category.toLowerCase()}')` which is correct, but the array values are used as both display keys and state values. If translation key lookup fails, the English category name bleeds through.

### L13 -- quran-room.tsx: Hardcoded hex colors in styles
**File:** `quran-room.tsx`
**Lines:** 340, 434
**Detail:** `colors={['#1a2a1a', '#0D1117', '#1a1a2a']}` (line 340) and `colors={[colors.emerald, '#065f3e']}` (line 434) use hardcoded hex values instead of theme tokens.

### L14 -- voice-post-create.tsx: Hardcoded hex colors throughout
**File:** `voice-post-create.tsx`
**Lines:** 191, 194, 213, 214, 236, 242
**Detail:** Multiple instances of `#F85149`, `#E11D48`, `#0D9B63`, `#FFF` instead of `colors.error`, `colors.emerald`, `tc.text.primary` theme tokens.

---

## Info

### I01 -- audio-room.tsx: Emoji reaction strings hardcoded in JSX
**File:** `audio-room.tsx`
**Lines:** 635
**Detail:** `['fire', 'heart', 'clap', 'laughing', 'palms_up', '100', 'party', 'thumbs_up']` emoji array is hardcoded. If the reaction set needs to change, it requires a code deploy. Consider making this configurable from the server.

### I02 -- quran-room.tsx: socketRef pattern duplicates useSocket
**File:** `quran-room.tsx`
**Lines:** 78-79
**Detail:** `socketRef` manually syncs with `socket` from `useSocket()`. This is a common pattern but adds complexity. The socket is already available from the provider.

### I03 -- watch-party.tsx: Video browse query uses undefined parameters
**File:** `watch-party.tsx`
**Line:** 57
**Detail:** `videosApi.getFeed(undefined, undefined)` passes explicit `undefined` for both parameters. This works but is fragile -- if the API signature changes, these will silently break.

### I04 -- audio-library.tsx: `handleUseSound` navigates to create-reel regardless of selected track
**File:** `audio-library.tsx`
**Lines:** 283-286
**Detail:** `handleUseSound` navigates to `/(screens)/create-reel` but doesn't pass the selected track ID or audio URL as a parameter. The reel creation screen has no way to know which track was selected.

### I05 -- go-live.tsx: rehearse mutation not disabled during createMutation pending
**File:** `go-live.tsx`
**Lines:** 116-120
**Detail:** While `createMutation.isPending`, the rehearse button is still tappable. `canGoLive` only checks `!createMutation.isPending`, not `!rehearseMutation.isPending`. User could start both simultaneously.

### I06 -- schedule-live.tsx: user from useUser() is imported but never used
**File:** `schedule-live.tsx`
**Lines:** 9, 69
**Detail:** `const { user } = useUser()` at line 69 is imported and destructured but never referenced.

### I07 -- Multiple screens: #FFF / #fff used instead of tc.text.primary or colors.text.primary
**Files:** `voice-recorder.tsx:258`, `voice-post-create.tsx:194,214`, `watch-party.tsx:200,300,377,384`, `audio-library.tsx:139,360,418,434,541,654,673`, `nasheed-mode.tsx:93`, `schedule-live.tsx:260`
**Detail:** White color is hardcoded as `#FFF`/`#fff` in ~20 places across the scope. In a light theme, white text on light backgrounds would be invisible. These should use theme-aware text tokens.

---

## Files with zero findings

None. Every file had at least one finding.

---

## Priority fix order

1. **C01** -- audio-room.tsx dark-mode-only stylesheet (entire screen broken in light theme)
2. **C02** -- audio-room.tsx stale `t` in fetchData
3. **C03** -- voice-post-create.tsx empty dependency array
4. **H04** -- quran-room.tsx Sound memory leak on verse change
5. **H05** -- audio-library.tsx WaveformBar render-body animation assignment
6. **H06** -- audio-library.tsx category filter is cosmetic
7. **H08** -- voice-recorder.tsx uploaded URL never returned
8. **H10** -- go-live.tsx missing permission request
9. **H11** -- schedule-live.tsx past date selection
10. **H01** -- audio-room.tsx no auto-leave on unmount
11. **H02** -- audio-room.tsx hardcoded 'User' fallback
12. **H03** -- audio-room.tsx reaction never sent
13. **H07** -- voice-recorder.tsx timer drift
14. **H09** -- watch-party.tsx hardcoded "LIVE"
15. All Medium/Low/Info items
