# M02 — Hostile Audit: Editor Screens

**Scope:** 8 files in `apps/mobile/app/(screens)/`
- `video-editor.tsx` (~1312 lines)
- `image-editor.tsx` (~658 lines)
- `caption-editor.tsx` (~968 lines)
- `green-screen-editor.tsx` (~945 lines)
- `end-screen-editor.tsx` (~668 lines)
- `reel-remix.tsx` (~999+ lines)
- `stitch-create.tsx` (~999+ lines)
- `duet-create.tsx` (~999+ lines)

**Date:** 2026-04-05
**Auditor:** Claude Opus 4.6 (hostile mode)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 12 |
| MEDIUM | 18 |
| LOW | 14 |
| INFO | 8 |
| **Total** | **57** |

---

## CRITICAL

### C01. video-editor.tsx: No discard-changes guard on cancel
- **Line:** 1260
- **Issue:** The cancel button (`router.back()`) navigates away without checking for unsaved edits. The video editor maintains dozens of state fields (trim, speed, filters, text overlays, voiceover URI, music selection, etc.) — all lost silently on cancel.
- **Contrast:** `image-editor.tsx` (line 76-89) and `end-screen-editor.tsx` (line 132-145) both implement `hasChanges` / `isDirty` guards with `Alert.alert` confirmation. Video editor — the most complex editor — has none.
- **Fix:** Add unsaved-changes guard using the undo stack length (`state.undoStack.length > 0`) as the dirty indicator.

### C02. reel-remix.tsx: Video blob loaded entirely into memory before upload
- **Lines:** 213-214
- **Issue:** `const videoBlob = await fetch(recordedUri).then((r) => r.blob())` loads the ENTIRE recorded video file into JS heap as a blob before uploading. For a 60-second video at 1080p, this can be 50-200MB in RAM. On low-end devices this will trigger OOM crashes.
- **Fix:** Use `expo-file-system` `uploadAsync()` which streams from disk, or use FormData with the URI directly. Never load video bytes into JS memory.

### C03. reel-remix.tsx: Upload uses hardcoded content type, ignores actual video format
- **Lines:** 215-218
- **Issue:** Upload always sends `Content-Type: 'video/mp4'` regardless of the actual format. On iOS, `CameraView.recordAsync()` may produce `.mov` (QuickTime) files. On Android, codec depends on device. Sending wrong MIME type can cause R2 to serve the file with incorrect headers, breaking playback.
- **Fix:** Detect actual MIME type from the file extension or use `expo-file-system` getInfoAsync, and pass it to both `getPresignUrl` and the PUT request.

### C04. green-screen-editor.tsx: Static `Dimensions.get('window')` at module scope
- **Line:** 24
- **Issue:** `const { width: screenWidth, height: screenHeight } = Dimensions.get('window');` is called at module scope (outside the component). This value is captured once at import time and never updates on iPad rotation/split-view or foldable devices. Used for `previewGradient` height (line 617: `height: screenHeight * 0.38`) and grid item widths (lines 692, 722, 760, 786).
- **Contrast:** `video-editor.tsx` correctly uses `useWindowDimensions()` inside the component and passes to `createStyles()`. `reel-remix.tsx` also uses module-level `Dimensions.get('window')` (line 34) with same bug.
- **Fix:** Move to `useWindowDimensions()` hook inside the component.

### C05. reel-remix.tsx: Static `Dimensions.get('window')` at module scope
- **Lines:** 34, 748-750
- **Issue:** `const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');` at module scope. Used for `CAMERA_HEIGHT` (line 748) and `PIP_WIDTH`/`PIP_HEIGHT` (lines 749-750) which feed into `createStyles`. These are stale on iPad rotation/split-view.
- **Fix:** Compute inside the component using `useWindowDimensions()`.

---

## HIGH

### H01. green-screen-editor.tsx: No cleanup for camera recording on unmount
- **Lines:** 121-149, 100-603
- **Issue:** If the user navigates away while recording is active (`isRecording === true`), there is no `useEffect` cleanup that calls `cameraRef.current?.stopRecording()`. The camera continues recording in the background, holding the microphone and camera resources. The `recordingGuard` ref prevents re-entry but does not stop an active recording.
- **Fix:** Add `useEffect` with cleanup that stops recording on unmount.

### H02. stitch-create.tsx: No cleanup for camera recording on unmount
- **Lines:** 76-97, 111-138
- **Issue:** Same as H01. Timer cleanup exists (line 94-96) but `cameraRef.current?.stopRecording()` is never called on unmount. If the user swipes back while recording, the camera stays active.
- **Fix:** Add unmount cleanup for camera recording.

### H03. duet-create.tsx: No cleanup for camera recording on unmount
- **Lines:** 97-117, 129-156
- **Issue:** Same pattern. Timer cleanup exists but camera recording is not stopped on unmount.

### H04. reel-remix.tsx: No cleanup for camera recording on unmount
- **Lines:** 86-106, 108-123
- **Issue:** Timer ref is cleaned up on unmount (lines 100-105) but camera recording (`cameraRef.current?.stopRecording()`) is not. Additionally, the `Video` components playing the original reel (lines 508, 533, 557) with `shouldPlay={true}` and `isMuted={false}` will continue playing audio after unmount unless explicitly unloaded.
- **Fix:** Add cleanup for both camera recording and Video playback (`videoRef.current?.unloadAsync()`).

### H05. stitch-create.tsx: setTimeout anti-pattern for navigation debounce
- **Line:** 550
- **Issue:** `setTimeout(() => { isNavigatingRef.current = false; }, 500);` — using setTimeout as a navigation debounce. If the component unmounts during the 500ms window, the callback runs after unmount, attempting to set a ref on an unmounted component. While ref writes don't crash like state writes, this is a code smell and the timeout is never cleaned up.
- **Fix:** Use `useRef` with `useEffect` cleanup, or better yet use expo-router's built-in navigation deduplication.

### H06. stitch-create.tsx: setTimeout in onRefresh (fake loading)
- **Line:** 108
- **Issue:** `setTimeout(() => setRefreshing(false), 300);` — this is a fake loading animation. Rules explicitly state "NEVER `setTimeout` for fake loading." The comment on line 105 even admits "No data to refresh on this screen — refresh is a visual-only gesture."
- **Fix:** Either remove the refresh control entirely (no data to refresh) or make it a no-op that immediately sets `refreshing` to false.

### H07. image-editor.tsx: handleDone does nothing — edits are discarded
- **Lines:** 69-72
- **Issue:** `handleDone` simply calls `router.back()` without applying any edits. The user adjusts brightness, contrast, saturation, selects a filter, crops — and pressing "Done" throws it all away silently. No data is passed back to the previous screen. No export. No save.
- **Fix:** Either implement actual image processing (e.g., via `expo-image-manipulator`), or pass edit parameters back via router params to the calling screen.

### H08. caption-editor.tsx: formatSrtTime produces incorrect fractional seconds
- **Lines:** 146-151
- **Issue:** `const s = seconds % 60;` — this is the raw float modulo, but then `s.toString().padStart(2, '0')` is called. If `seconds` is `65.5`, `s` becomes `5.5`, and `.padStart(2, '0')` produces `5.5` (length > 2, no padding needed), but it lacks the leading zero and the millisecond portion is wrong (should be `05,500` not `5.5,000`). The `,000` is always hardcoded, ignoring actual fractional seconds.
- **Fix:** Split seconds into integer seconds and milliseconds properly: `const si = Math.floor(s); const ms = Math.round((s - si) * 1000);` and format accordingly.

### H09. caption-editor.tsx: Hardcoded duration "01:30" in timestamp display
- **Line:** 375
- **Issue:** `{formatTime(currentTime)} / 01:30` — the total duration is hardcoded to "01:30" (90 seconds). The actual video duration is never fetched from the video metadata. If the video is 30 seconds or 5 minutes, the display is wrong.
- **Fix:** Fetch actual video duration from the video file or from the API response.

### H10. end-screen-editor.tsx: Module-level mutable counter for draft IDs
- **Lines:** 61-73
- **Issue:** `let draftCounter = 0;` at module scope. This counter persists across screen navigations because module-level variables are not reset when the component unmounts. If a user opens the end screen editor, adds 3 items (counter=3), goes back, and opens it again, IDs start at 4. While functional, this is a memory leak pattern and will produce ever-growing IDs if the screen is opened/closed repeatedly.
- **Fix:** Use `useRef` for the counter inside the component, initialized to 0.

### H11. end-screen-editor.tsx: No URL validation for link-type end screens
- **Lines:** 358-371
- **Issue:** The URL input for `link`-type end screens accepts any text with no validation. A user could enter `javascript:alert(1)`, a relative path, or garbage text. The server should validate, but client-side validation provides UX feedback and prevents obviously bad data from being sent.
- **Fix:** Add URL validation (at minimum check for `https://` prefix) before allowing save.

### H12. image-editor.tsx: Slider is visual-only — no drag interaction
- **Lines:** 185-200
- **Issue:** The brightness/contrast/saturation "sliders" are purely visual — they render a track, fill, and thumb, but there is no gesture handler or Pressable interaction to actually change the values. The user cannot drag the slider. The only way to see different values would be through preset buttons, but there are none for this slider. The values are stuck at 50.
- **Fix:** Implement an actual interactive slider (either a `Slider` component, `PanGestureHandler`, or at minimum preset tap targets like the green-screen editor's `SimpleSlider`).

---

## MEDIUM

### M01. green-screen-editor.tsx: Audio permission requested without checking result
- **Lines:** 117-119
- **Issue:** `Audio.requestPermissionsAsync()` is called in a fire-and-forget `useEffect` with no error handling and no check of the returned `granted` value. If audio permission is denied, recording will fail with a confusing error.
- **Fix:** Store the audio permission result in state and show appropriate UI if denied.

### M02. reel-remix.tsx: Camera permission requested in useEffect without dependency guard
- **Lines:** 79-83
- **Issue:** `requestPermission()` is called inside useEffect with `[permission, requestPermission]` as deps. If `requestPermission` changes identity on re-render (it shouldn't, but if it does), this could trigger an infinite loop. More importantly, calling `requestPermission()` on every mount (even if already granted) can cause unnecessary permission dialogs on some Android versions.
- **Fix:** Only call `requestPermission()` if `permission` is `null` (undetermined), not when it's `{ granted: false }` (denied).

### M03. duet-create.tsx: Hardcoded colors in StyleSheet instead of theme tokens
- **Lines:** 641-999+
- **Issue:** The `styles` object is a static `StyleSheet.create` (not using `createStyles(tc)` pattern for all styles). Multiple hardcoded color references:
  - Line 644: `backgroundColor: colors.dark.bg` (should be `tc.bg`)
  - Line 670: `backgroundColor: colors.dark.surface` (should be `tc.surface`)
  - Line 685: `color: colors.text.primary` (should be `tc.text.primary`)
  - Line 689: `color: colors.text.secondary` (should be `tc.text.secondary`)
  - Line 776: `color: colors.text.secondary` (should be `tc.text.secondary`)
  - Line 784: `backgroundColor: colors.dark.bgCard` (should be `tc.bgCard`)
  - Line 790: `backgroundColor: colors.dark.surface` (should be `tc.surface`)
  - Line 884: `color: colors.text.primary` (should be `tc.text.primary`)
  - Line 992: `backgroundColor: colors.dark.surface` (should be `tc.surface`)
- **Severity reason:** Light mode would show dark-mode colors.

### M04. end-screen-editor.tsx: Hardcoded colors in StyleSheet
- **Lines:** 500-668
- **Issue:** Similar to M03. The `styles` object uses hardcoded dark-mode colors:
  - Line 504: `backgroundColor: colors.dark.bg`
  - Line 525: `color: colors.text.secondary`
  - Line 544: `color: colors.text.primary`
  - Line 562: `borderColor: colors.dark.border`, `backgroundColor: colors.dark.bgCard`
  - Line 574: `color: colors.text.secondary`
  - Line 588: `color: colors.text.primary`
  - Line 592: `borderColor: colors.dark.border`, `backgroundColor: colors.dark.bgCard`
  - Line 632: `backgroundColor: colors.dark.surface`
  - Line 636: `color: colors.text.primary`

### M05. caption-editor.tsx: isPlaying state has no effect — video never plays
- **Lines:** 70, 396-408
- **Issue:** `isPlaying` state is toggled by the play button, but there is no actual video player. The preview area (lines 312-424) only renders a gradient placeholder with an icon — no `<Video>` component. The play/pause button and rewind/forward buttons manipulate `currentTime` state but nothing actually plays. The screen is fundamentally non-functional for video preview.
- **Fix:** Add an actual Video component that plays the video identified by `videoId`.

### M06. caption-editor.tsx: currentTime never advances automatically
- **Lines:** 69, 386-414
- **Issue:** `currentTime` is manually incremented/decremented by the +5/-5 buttons but never advances automatically during "playback." Without a timer or video status callback, the caption overlay always shows the same caption segment.
- **Fix:** When `isPlaying` is true, use `setInterval` to advance `currentTime` (or better, bind to an actual Video player's playback status).

### M07. green-screen-editor.tsx: Container style has hardcoded background color
- **Line:** 608
- **Issue:** `backgroundColor: colors.dark.bg` in the container style. The component uses `tc.bg` for the SafeAreaView (line 401), but the StyleSheet fallback (line 608) uses the dark-mode constant. If the style is ever applied without the inline override, light mode is broken.

### M08. image-editor.tsx: Multiple hardcoded rgba colors in StyleSheet
- **Lines:** 29-39, 121, 229, 284-285, 349-351, etc.
- **Issue:** The FILTERS array and many LinearGradient colors use hardcoded rgba strings. While some are intentional design constants, several overlay/crop colors like `'rgba(0,0,0,0.5)'` (line 350), `'rgba(255,255,255,0.3)'` (lines 373-396), `'rgba(255,255,255,0.1)'` (lines 37, 505) should use theme-aware values so they work in both light and dark modes.

### M09. reel-remix.tsx: Video components not cleaned up on unmount
- **Lines:** 321-340 (preview view), 507-515, 532-541, 557-564 (recording view)
- **Issue:** Multiple `<Video>` components with `shouldPlay={true}` and `isLooping={true}` are rendered. When the component unmounts, these videos continue playing in the background because there's no `useEffect` cleanup calling `unloadAsync()` on the Video refs. This wastes CPU/battery and can cause audio bleeding into other screens.
- **Fix:** Use refs for all Video components and call `unloadAsync()` on unmount.

### M10. stitch-create.tsx: Video component with shouldPlay and no cleanup
- **Lines:** 218-226
- **Issue:** Original video plays with `shouldPlay` and `isLooping` but has no ref and no cleanup. Same resource leak as M09.

### M11. duet-create.tsx: Multiple Video components with shouldPlay and no cleanup
- **Lines:** 276-285, 331-340, 379-390
- **Issue:** Three layout modes each render a `<Video>` for the original content with `shouldPlay` and `isLooping`. No refs, no cleanup on unmount or layout switch.

### M12. image-editor.tsx: Missing unsaved-changes guard for "Done" button
- **Lines:** 69-72
- **Issue:** While cancel has a discard guard (line 76-89), the "Done" button also just calls `router.back()` without actually saving anything. The `hasChanges` boolean exists but is only used for the cancel guard. The user presses "Done" expecting their edits to be saved, but nothing happens.
- **Fix:** Either implement actual save/export on Done, or rename the button to clarify it's a discard action.

### M13. video-editor.tsx: Speech.stop() not called on unmount
- **Lines:** 546-558
- **Issue:** TTS via `expo-speech` is started with `Speech.speak()` but there is no cleanup on unmount. If the user navigates away while TTS is speaking, it continues playing in the background. `Speech.stop()` should be called in a useEffect cleanup.
- **Fix:** Add `useEffect(() => { return () => { Speech.stop(); }; }, []);` in the component.

### M14. reel-remix.tsx: thumbnailUrl set to video URL
- **Line:** 223
- **Issue:** `thumbnailUrl: presign.publicUrl` — the thumbnail URL is set to the same URL as the video. The server receives a video URL where it expects a thumbnail image URL. This will either fail validation or display a broken thumbnail everywhere the reel appears.
- **Fix:** Generate an actual thumbnail (e.g., via `expo-video-thumbnails`) before upload.

### M15. stitch-create.tsx: No upload mutation — stitch just passes URI to create-reel
- **Lines:** 543-551
- **Issue:** Unlike `reel-remix.tsx` which has a full upload mutation, `stitch-create.tsx` just passes the raw local `recordedUri` to the `create-reel` screen. This works for navigation but the local URI is temporary and may be cleaned up by the OS. If the user takes a long time on the create-reel screen, the video file may be garbage collected.
- **Fix:** Copy the video to a persistent location (via `expo-file-system`) before navigating.

### M16. duet-create.tsx: No upload/post flow — Next button navigates to create-reel
- **Lines:** 617-619
- **Issue:** Similar to M15. The local `recordedUri` is passed directly to `create-reel`. No persistent copy.

### M17. caption-editor.tsx: Loading skeleton not wrapped in ScreenErrorBoundary
- **Lines:** 282-297
- **Issue:** The early-return loading skeleton is rendered inside a bare `SafeAreaView` without `ScreenErrorBoundary`. If the Skeleton component throws, it crashes the entire app instead of showing a graceful error.
- **Fix:** Wrap the loading skeleton return in `ScreenErrorBoundary`.

### M18. end-screen-editor.tsx: scrollContent paddingTop uses insets.top + hardcoded offset
- **Line:** 237
- **Issue:** `paddingTop: insets.top + 52 + spacing.base` — the `52` is a hardcoded header height. If `GlassHeader` changes its height or the user has accessibility text scaling, the content will overlap or have a gap.
- **Fix:** Use a measured header height or a layout callback instead of a magic number.

---

## LOW

### L01. image-editor.tsx: cropFrameScale shared value created but never used
- **Line:** 61
- **Issue:** `const cropFrameScale = useSharedValue(1);` is created but never read or animated. Dead code.

### L02. image-editor.tsx: unused import `withSpring` and `interpolate`
- **Lines:** 8-9
- **Issue:** `withSpring`, `withTiming`, and `interpolate` are imported from `react-native-reanimated` but only `withSpring` and `withTiming` might be needed. `interpolate` is never used. `withSpring` and `withTiming` are also unused since no animations use them.

### L03. image-editor.tsx: unused `RNImage` import
- **Line:** 4
- **Issue:** `Image as RNImage` is imported from react-native but never used in the JSX.

### L04. image-editor.tsx: Crop functionality is purely decorative
- **Lines:** 96-134, 237-254
- **Issue:** The crop tab renders a grid overlay and aspect ratio buttons, but there is no actual cropping logic. No gesture handlers for dragging corners. No crop region state. The "Drag corners" hint (line 130) promises functionality that doesn't exist.

### L05. video-editor.tsx: unused `Dimensions` import
- **Line:** 1 (implicit)
- **Issue:** `Dimensions` is imported from react-native at line 1 (`useWindowDimensions` is used instead). The fallback `Dimensions.get('window')` at line 31 could use `useWindowDimensions` pattern instead.

### L06. green-screen-editor.tsx: Unused imports
- **Lines:** 14, 19, 22
- **Issue:** `Skeleton` (line 14) and `BrandedRefreshControl` (line 19) are imported but never used in the JSX. Also `navigate` (line 22) is imported but used only once and could be replaced with router.push.

### L07. stitch-create.tsx: audioPermission state set but never used for UI gating
- **Lines:** 62, 69-74
- **Issue:** `audioPermission` state is set from `Audio.requestPermissionsAsync()` but is never checked. If audio permission is denied, recording proceeds but may produce silent video with no user feedback.

### L08. duet-create.tsx: audioPermission state set but never used
- **Lines:** 73, 86-95
- **Issue:** Same as L07. Audio permission result is stored in state but never influences UI or behavior.

### L09. stitch-create.tsx: showPreview state set but never used
- **Lines:** 59, 507
- **Issue:** `const [showPreview, setShowPreview] = useState(false);` is declared and `setShowPreview(true)` is called from the "Play Preview" button (line 507), but `showPreview` is never read anywhere in the JSX. The preview functionality is unimplemented.

### L10. reel-remix.tsx: recordedUri blob fetch has no timeout
- **Line:** 213
- **Issue:** `await fetch(recordedUri).then((r) => r.blob())` — fetching a local file URI as a blob has no timeout. While local file access should be fast, on slow storage or with very large files, this could hang indefinitely.

### L11. image-editor.tsx: `imagePlaceholderText` style missing color
- **Line:** 335
- **Issue:** The `imagePlaceholderText` style (line 335) doesn't set a color. It inherits from the parent, which for `LinearGradient` children defaults to black — invisible against the dark gradient background.

### L12. duet-create.tsx: Hardcoded "@your_username" in panel
- **Line:** 315
- **Issue:** `<Text style={styles.panelUsername}>@your_username</Text>` — hardcoded string instead of the actual user's username. Not i18n-ized, not fetched from auth context.
- **Fix:** Use the authenticated user's username from the auth hook/context.

### L13. caption-editor.tsx: scrollRef created but never used for scrolling
- **Line:** 65
- **Issue:** `const scrollRef = useRef<ScrollView>(null);` is created and attached (line 305) but never used for programmatic scrolling (e.g., scroll to active caption).

### L14. stitch-create.tsx: screenWidth captured at module scope but only used in styles
- **Line:** 26
- **Issue:** `const { width: screenWidth } = Dimensions.get('window');` at module scope. Only used once in the styles function. Same rotation/split-view issue as C04.

---

## INFO

### I01. video-editor.tsx: Well-structured hook orchestration
- **Lines:** 66-158
- **Issue (positive):** The video editor properly extracts state, playback, timeline, volume, voiceover, and export logic into separate hooks. This is the best-structured screen in this audit batch. However, the hooks file should be audited separately for completeness.

### I02. All screens: ScreenErrorBoundary consistently used
- All 8 screens wrap their return in `<ScreenErrorBoundary>`. This is correct practice. Exception: caption-editor's loading skeleton return (M17).

### I03. All screens: Consistent use of i18n via useTranslation
- All screens use `t()` for user-facing strings. Minor exception: some i18n keys use inline fallback strings which may not exist in all 8 language files (e.g., `t('common.unsavedChanges', 'Unsaved Changes')` at end-screen-editor.tsx line 136).

### I04. All screens: Haptic feedback consistently used
- All 8 screens use `useContextualHaptic()` with appropriate semantic methods (`tick`, `navigate`, `success`, `error`, `delete`, `save`).

### I05. green-screen-editor.tsx: Background segmentation honestly disclosed as non-functional
- **Line:** 131
- **Issue (positive):** The toast `t('screens.greenScreen.noSegmentation')` honestly tells the user that background segmentation is not available. This is correct per integrity rules.

### I06. reel-remix.tsx: Well-implemented recording timer with max-time auto-stop
- **Lines:** 86-106, 141-145
- **Issue (positive):** Timer properly cleaned up on unmount and auto-stop extracted from state updater to avoid side-effect anti-pattern.

### I07. end-screen-editor.tsx: Proper dirty state tracking with ref-based comparison
- **Lines:** 119-130
- **Issue (positive):** Uses `JSON.stringify` comparison against initial state stored in a ref. This is a correct pattern for tracking unsaved changes.

### I08. stitch-create.tsx: Recording lock ref prevents double-tap race condition
- **Lines:** 67, 113-114
- **Issue (positive):** `isRecordingLockRef` used correctly to prevent concurrent recordings from double-taps.

---

## Cross-Cutting Issues

### XC01. 5 of 8 screens use module-level `Dimensions.get('window')` instead of `useWindowDimensions()`
| Screen | Line | Variables |
|--------|------|-----------|
| green-screen-editor.tsx | 24 | screenWidth, screenHeight |
| reel-remix.tsx | 34 | SCREEN_W, SCREEN_H |
| stitch-create.tsx | 26 | screenWidth |
| caption-editor.tsx | N/A | Uses useWindowDimensions correctly |
| duet-create.tsx | N/A | Uses useWindowDimensions correctly |

### XC02. 4 of 8 screens have no camera/video cleanup on unmount
| Screen | Camera cleanup | Video cleanup | Timer cleanup |
|--------|---------------|---------------|---------------|
| green-screen-editor.tsx | MISSING | N/A | N/A |
| reel-remix.tsx | MISSING | MISSING | OK |
| stitch-create.tsx | MISSING | MISSING | OK |
| duet-create.tsx | MISSING | MISSING | OK |

### XC03. 2 of 8 screens have hardcoded dark-mode colors in static StyleSheet (not theme-aware)
| Screen | Count of hardcoded color refs |
|--------|------------------------------|
| duet-create.tsx | 15+ (`colors.dark.*`, `colors.text.*`) |
| end-screen-editor.tsx | 12+ (`colors.dark.*`, `colors.text.*`) |

### XC04. None of the 4 camera screens validate audio permission before recording
| Screen | Audio perm requested | Audio perm checked before record |
|--------|---------------------|--------------------------------|
| green-screen-editor.tsx | Yes (fire-and-forget) | No |
| reel-remix.tsx | No (relies on camera perm only) | No |
| stitch-create.tsx | Yes (stored in state) | Never checked |
| duet-create.tsx | Yes (stored in state) | Never checked |

---

## File-by-File Checklist Results

| Check | video-editor | image-editor | caption-editor | green-screen | end-screen | reel-remix | stitch-create | duet-create |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Error handling | OK | PARTIAL | OK | PARTIAL | OK | OK | OK | PARTIAL |
| Loading states | OK | N/A | OK | OK | OK | OK | OK | OK |
| Cleanup on unmount | PARTIAL (Speech) | OK | OK | FAIL | OK | FAIL | FAIL | FAIL |
| i18n | OK | OK | OK | OK | OK | OK | OK | OK |
| Type safety | OK | OK | OK | OK | OK | OK | OK | OK |
| Memory (large files) | OK (hooks) | OK | OK | OK | OK | FAIL (blob) | OK | OK |
| Input validation | OK | N/A | OK | OK | PARTIAL | OK | OK | OK |
| Theme tokens | OK | PARTIAL | OK | PARTIAL | FAIL | OK | PARTIAL | FAIL |
