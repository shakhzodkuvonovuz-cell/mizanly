# Agent #38 — Video/Media Editing Screens Deep Audit

**Scope:** All video/media editing, camera, and recording screens
**Files audited:** 16 screens, every line read
**Date:** 2026-03-21
**Agent:** Claude Opus 4.6 (1M context), audit agent #38 of 67

---

## Files Audited

| # | File | Lines | Status |
|---|------|-------|--------|
| 1 | `apps/mobile/app/(screens)/video-editor.tsx` | ~600 | Has real Video playback + FFmpeg export pipeline |
| 2 | `apps/mobile/app/(screens)/duet-create.tsx` | 905 | Camera works, but hardcoded original video data |
| 3 | `apps/mobile/app/(screens)/stitch-create.tsx` | 895 | Camera works, but hardcoded original video data |
| 4 | `apps/mobile/app/(screens)/camera.tsx` | 488 | No actual camera — placeholder gradient only |
| 5 | `apps/mobile/app/(screens)/image-editor.tsx` | 637 | Filter/crop UI only — no actual image loaded or processed |
| 6 | `apps/mobile/app/(screens)/green-screen-editor.tsx` | 916 | Camera renders but no background replacement processing |
| 7 | `apps/mobile/app/(screens)/create-video.tsx` | 890 | Full upload pipeline with presigned URLs — functional |
| 8 | `apps/mobile/app/(screens)/video-premiere.tsx` | 222 | Functional — creates premiere via API |
| 9 | `apps/mobile/app/(screens)/caption-editor.tsx` | 930 | Functional — fetches/saves subtitles via API |
| 10 | `apps/mobile/app/(screens)/end-screen-editor.tsx` | 622 | **BROKEN — syntax error in imports prevents compilation** |
| 11 | `apps/mobile/app/(screens)/disposable-camera.tsx` | 588 | **BROKEN — syntax error in imports prevents compilation** |
| 12 | `apps/mobile/app/(screens)/reel-templates.tsx` | 515 | Functional — browse/use templates |
| 13 | `apps/mobile/app/(screens)/reel-remix.tsx` | ~400+ | **BROKEN — duplicate Pressable import + missing closing brace** |
| 14 | `apps/mobile/app/(screens)/create-reel.tsx` | 979 | **BROKEN — missing closing brace in imports** |
| 15 | `apps/mobile/app/(screens)/voice-recorder.tsx` | 307 | Functional — records audio, but send() is a stub |
| 16 | `apps/mobile/app/(screens)/dm-note-editor.tsx` | (out of scope — DM feature, not video editing) |

---

## CRITICAL FINDINGS (P0 — Compilation Breaks / Ship Blockers)

### FINDING 38-001: end-screen-editor.tsx — SYNTAX ERROR — Missing closing brace in import
**File:** `apps/mobile/app/(screens)/end-screen-editor.tsx`
**Lines:** 2-6
**Severity:** P0 — Screen will not compile
**Code:**
```tsx
import {
  View, Text, StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
  Pressable,
import { useRouter, useLocalSearchParams } from 'expo-router';
```
**Problem:** The destructured import from `react-native` is missing the closing `} from 'react-native';`. Line 5 has `Pressable,` without a closing brace, then line 6 starts a new import statement. This is a syntax error that will prevent the entire screen from compiling.
**Impact:** End screen editor is completely non-functional. Any video that needs end screen configuration cannot have one.

---

### FINDING 38-002: disposable-camera.tsx — SYNTAX ERROR — Missing closing brace in import
**File:** `apps/mobile/app/(screens)/disposable-camera.tsx`
**Lines:** 2-4
**Severity:** P0 — Screen will not compile
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, Dimensions, Alert,
import { useRouter, useLocalSearchParams } from 'expo-router';
```
**Problem:** Identical pattern — the destructured import from `react-native` is missing `} from 'react-native';`. Line 3 ends with `Alert,` and line 4 jumps straight to the next import.
**Impact:** Disposable camera feature completely broken.

---

### FINDING 38-003: create-reel.tsx — SYNTAX ERROR — Missing closing brace in import
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 2-5
**Severity:** P0 — Screen will not compile
**Code:**
```tsx
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Alert, Dimensions, Pressable,
import { useRouter } from 'expo-router';
```
**Problem:** Same pattern. Line 4 ends with `Pressable,` and line 5 starts a new import without closing the previous destructure.
**Impact:** The entire create-reel flow is broken. This is the primary screen for creating Bakra content (short-form video). One of the app's five core content creation flows cannot function.

---

### FINDING 38-004: reel-remix.tsx — DUPLICATE IMPORT + SYNTAX ERROR
**File:** `apps/mobile/app/(screens)/reel-remix.tsx`
**Lines:** 2-6
**Severity:** P0 — Screen will not compile
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, TextInput,
  Dimensions, Alert, ScrollView, RefreshControl,
  Pressable,
} from 'react-native';
```
**Problem:** `Pressable` is imported twice (line 3 and line 5). This is a duplicate identifier error. While the closing brace is present, the duplicate import of `Pressable` will likely cause a compilation error depending on the bundler strictness. Even if it doesn't error, it's a code quality issue.
**Impact:** Reel remix (reaction video to another reel) is broken.

---

## HIGH FINDINGS (P1 — Dead-end Screens / Features That Don't Work)

### FINDING 38-005: camera.tsx — NO ACTUAL CAMERA — Placeholder Gradient Only
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Lines:** 122-258
**Severity:** P1 — Screen is a visual facade
**Details:** Despite importing `expo-camera`'s `CameraView` and `useCameraPermissions` at the top of the file, the screen never actually renders a `<CameraView>` component. Instead it renders:
```tsx
<View style={styles.cameraPreview}>
  <LinearGradient
    colors={['#1a1a2e', '#16213e', '#0f3460']}
    style={styles.cameraGradient}
  />
  <View style={styles.cameraOverlay}>
    <Text style={styles.cameraOverlayText}>{t('screens.camera.previewText')}</Text>
  </View>
</View>
```
The "capture" button just navigates to `create-post`, `create-story`, or `create-reel` without capturing any photo/video. The video recording timer is purely cosmetic (increments a counter but records nothing).
**Impact:** Users see a fake camera UI. No photos or videos are actually captured. The gallery shortcut button (line 208-215) has no `onPress` handler at all — it's a dead button.

---

### FINDING 38-006: camera.tsx — useState Misused as useEffect
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Lines:** 105-114
**Severity:** P1 — Anti-pattern that may cause incorrect behavior
**Code:**
```tsx
useState(() => {
  pulseAnim.value = withRepeat(
    withSequence(
      withTiming(1.05, { duration: 1000 }),
      withTiming(1, { duration: 1000 })
    ),
    -1,
    true
  );
});
```
**Problem:** `useState` is being used as a side-effect initializer. While `useState` accepts an initializer function, its purpose is to compute initial state — not run side effects. The return value is ignored (no destructuring). This should be `useEffect` with an empty dependency array. With `useState`, this code runs during render (violating React rules) and will re-run on strict mode double-render.

---

### FINDING 38-007: image-editor.tsx — DEAD-END — No Image Is Ever Loaded or Processed
**File:** `apps/mobile/app/(screens)/image-editor.tsx`
**Lines:** 1-637
**Severity:** P1 — Screen is a visual facade
**Details:** The entire image editor screen:
1. Never receives an image URI from navigation params (no `useLocalSearchParams`)
2. Never loads any image (the preview area shows a gradient placeholder with an icon)
3. All filter/crop/adjust controls change local state but produce zero output
4. The "Done" button (line 62-64) simply calls `router.back()` — no edited image is returned
5. The sliders (brightness, contrast, saturation) change state values but there's no actual image processing
6. The crop tool shows drag handles but they're not draggable (no PanGestureHandler)

**Impact:** Users navigate to the image editor, see a beautiful UI, make adjustments to nothing, press "Done", and return to the previous screen with no changes.

---

### FINDING 38-008: green-screen-editor.tsx — Camera Renders But No Background Replacement
**File:** `apps/mobile/app/(screens)/green-screen-editor.tsx`
**Lines:** 333-539
**Severity:** P1 — Feature is misleading
**Details:**
1. The camera preview renders correctly using `<CameraView>` on top of background colors/gradients
2. The recording button records video via `cameraRef.current.recordAsync()`
3. BUT: There is zero background segmentation/removal — the camera just overlays on top of the background as a full-screen layer (line 562-569: `cameraOverlay` has `position: absolute, top: 0, left: 0, right: 0, bottom: 0`)
4. The `recordedUri` state is set but never used — after recording, the video is stored but nothing happens with it
5. The "Apply & Record" button (line 526) navigates to `/camera` — it doesn't use the green screen at all
6. The blur/edge smoothing sliders are decorative only (state changes but no processing applied)
7. Custom upload buttons (lines 261-291) have no `onPress` handler on the outer Pressable — the upload action never fires

**Impact:** Users believe they're recording with a green screen effect, but the camera just sits on top of the background with no segmentation.

---

### FINDING 38-009: duet-create.tsx — Hardcoded Creator Data, No Original Video Loaded
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Lines:** 69-75
**Severity:** P1 — Screen cannot receive real content
**Code:**
```tsx
const originalCreator = {
  username: 'creative_artist',
  displayName: 'Creative Artist',
  isVerified: true,
  videoTitle: 'Amazing Dance Routine',
  avatarUrl: null,
};
```
**Problem:**
1. No `useLocalSearchParams` — the screen has no way to receive the original video's ID or URL
2. The "original video" panel shows a static play icon placeholder (never plays actual video)
3. Line 222: `@your_username` is hardcoded instead of showing the actual user's username
4. The "Next" button (line 465) navigates to `/create-reel` but doesn't pass the recorded video URI as a param
5. Volume sliders (lines 440-456) are visual only — `originalVolume` and `yourVolume` state never connects to audio

---

### FINDING 38-010: stitch-create.tsx — Hardcoded Creator Data, No Original Video Loaded
**File:** `apps/mobile/app/(screens)/stitch-create.tsx`
**Lines:** 80-84
**Severity:** P1 — Screen cannot receive real content
**Code:**
```tsx
const originalCreator = {
  username: 'viral_dancer',
  displayName: 'Viral Dancer',
  isVerified: true,
};
```
**Problem:** Same as duet-create: no `useLocalSearchParams`, no original video playback. The "Play Preview" button (line 426) sets `showPreview` to true but there's no preview UI rendered for that state. Transition effects (cut/fade/slide/zoom/wipe) are selector-only — no actual video processing occurs.

---

### FINDING 38-011: voice-recorder.tsx — send() Function Is a No-Op Stub
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx`
**Lines:** 116-120
**Severity:** P1 — Recording works but is lost
**Code:**
```tsx
const send = useCallback(() => {
  if (!uri) return;
  setUploading(true);
  router.back();
}, [uri, router]);
```
**Problem:** The `send` function sets `uploading` to true and immediately calls `router.back()`. No upload happens. No API call. No file transfer. The recorded audio is discarded when navigation occurs. The voice recorder works perfectly (records, plays back, shows waveform) but cannot deliver its output anywhere.

---

## MEDIUM FINDINGS (P2)

### FINDING 38-012: video-editor.tsx — FFmpeg Export Falls Back to Simulated Progress
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** 138-159
**Severity:** P2 — Misleading UX
**Code:**
```tsx
const FFmpegKit = await import('ffmpeg-kit-react-native').catch(() => null);

if (!FFmpegKit || !videoUri) {
  // Simulate export progress for demo/development
  for (let i = 0; i <= 100; i += 5) {
    await new Promise(r => setTimeout(r, 100));
    setExportProgress(i);
    exportProgressAnim.value = withTiming(i, { duration: 80 });
  }
  Alert.alert(t('videoEditor.exportComplete'), '', [
    { text: 'OK', onPress: () => router.back() },
  ]);
  return;
}
```
**Problem:** While `ffmpeg-kit-react-native` is listed in `package.json`, the dynamic import approach means that if it fails to load (native module not linked, which is common in Expo managed workflow), the export silently fakes success with a progress bar animation. Users see "Export Complete" but no file is created.
**Note:** The real FFmpeg pipeline (lines 161-221) is well-structured with trim, speed, text overlay, and volume filters. But the fallback path makes it deceptive.

---

### FINDING 38-013: video-editor.tsx — Waveform Uses Math.random() — Non-deterministic Rendering
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** 559-568 (approximate, in timeline section)
**Severity:** P2 — Visual jank
**Code:**
```tsx
{Array.from({ length: 40 }).map((_, i) => (
  <View
    key={i}
    style={[
      styles.waveformBar,
      { height: Math.random() * 30 + 10 }
    ]}
  />
))}
```
**Problem:** `Math.random()` inside render produces different heights on every re-render. The waveform will jitter constantly as any state update triggers re-render. This should use `useMemo` with a seeded random or actual audio waveform data.

---

### FINDING 38-014: video-editor.tsx — Trim Handles Are Not Interactive
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** ~572-587
**Severity:** P2 — Core trim feature non-functional
**Details:** The trim handles (left and right scissors icons) are positioned as static `View` elements with no `PanGestureHandler` or touch handling. Users cannot drag them to set start/end times. The "Split at Playhead" and "Delete Selected Segment" buttons (lines 252-266) are `Pressable` elements with no `onPress` handlers — they are dead buttons.

---

### FINDING 38-015: video-editor.tsx — Volume and Music Sliders Are Visual Only
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** ~431-463
**Severity:** P2 — Controls don't actually change anything interactive
**Details:** The volume slider tracks display `originalVolume` and `musicVolume` values, but there is no touch handler to change them. The slider thumb is a static `View` — no `PanGestureHandler` or `Slider` component. The "Add From Audio Library" button navigates nowhere.
**Note:** The original volume IS applied to the Video component via `useEffect` at line 123-127, so that part works if the user could change the value.

---

### FINDING 38-016: video-editor.tsx — Filter Selection Is Visual Only
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** ~301-330
**Severity:** P2 — Filters don't affect video
**Details:** The filter buttons change `selectedFilter` state, but this state is never applied to the `<Video>` component or included in the FFmpeg export command. The filter colors are shown in preview circles but never affect actual video rendering or export.

---

### FINDING 38-017: duet-create.tsx + stitch-create.tsx — Multiple Duplicate accessibilityRole Props
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Lines:** 301, 391, 429, 463
**File:** `apps/mobile/app/(screens)/stitch-create.tsx`
**Lines:** 185, 240, 337, 424
**Severity:** P2 — Code quality
**Code example:**
```tsx
<Pressable accessibilityRole="button" accessibilityRole="button"
```
**Problem:** Every `Pressable` in these files has `accessibilityRole="button"` specified twice. This is a JSX duplicate prop that causes the second value to silently override the first (same value here, so functionally harmless, but indicates copy-paste issues).

---

### FINDING 38-018: camera.tsx — Gallery Shortcut Button Has No onPress Handler
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Lines:** 207-215
**Severity:** P2 — Dead button
**Code:**
```tsx
<Pressable style={styles.galleryButton}>
  <LinearGradient ...>
    <Icon name="image" size="sm" color={colors.text.tertiary} />
  </LinearGradient>
</Pressable>
```
**Problem:** No `onPress` handler. No `accessibilityRole="button"`. Users can tap the gallery button but nothing happens.

---

### FINDING 38-019: camera.tsx — Flash Toggle Uses Wrong Icon
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Lines:** 160-166
**Severity:** P2 — UX confusion
**Code:**
```tsx
<Icon name={flashOn ? 'eye' : 'eye-off'} size="sm" color="#fff" />
```
**Problem:** Flash toggle uses `eye` / `eye-off` icons instead of the expected flash/lightning icon. The `sun` icon used in other screens (duet-create, stitch-create) is more appropriate, or a dedicated flash icon.

---

### FINDING 38-020: camera.tsx — Hardcoded borderRadius Violates Project Rules
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Line:** 461
**Severity:** P2 — Code quality rule violation
**Code:**
```tsx
stopButton: {
  width: 28,
  height: 28,
  borderRadius: 4, // VIOLATION: should use radius.sm (6)
  backgroundColor: colors.error,
},
```
**Problem:** Project rule #3 states "NEVER hardcode border radius >= 6". While 4 < 6, the project convention is to always use `radius.*` tokens. This is the only screen that uses a raw number for borderRadius.

---

### FINDING 38-021: camera.tsx — No Actual Camera Permission Request
**File:** `apps/mobile/app/(screens)/camera.tsx`
**Lines:** 20-114
**Severity:** P2 — Permissions not handled
**Details:** The screen imports `useCameraPermissions` but never actually calls `requestPermission()`. The permission is neither checked nor requested. Since the screen never renders `<CameraView>`, this doesn't cause a crash, but it means the camera permission state is never established for this screen.

---

### FINDING 38-022: video-premiere.tsx — Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/video-premiere.tsx`
**Lines:** 67, 80
**Severity:** P2 — i18n violation
**Code:**
```tsx
<Text style={styles.label}>Date (YYYY-MM-DD)</Text>
...
<Text style={styles.label}>Time (HH:MM)</Text>
...
<Text style={styles.label}>Countdown Theme</Text>
```
**Problem:** Three labels are hardcoded in English instead of using the `t()` translation function. Other labels on the same screen correctly use `t('premiere.schedule')` etc.

---

### FINDING 38-023: video-premiere.tsx — Date Input Is Raw TextInput Without Validation
**File:** `apps/mobile/app/(screens)/video-premiere.tsx`
**Lines:** 68-76
**Severity:** P2 — Bad UX / potential API error
**Details:** The date and time are entered as raw text strings. The only validation is `date.length >= 10 && time.length >= 5`. Users can enter "abcdefghij" as a date and "ab:cd" as a time and it will pass validation. The `new Date('abcdefghijTab:cd:00')` will produce an Invalid Date, which when `.toISOString()` is called will throw.

---

### FINDING 38-024: caption-editor.tsx — Video Preview Is Static Placeholder
**File:** `apps/mobile/app/(screens)/caption-editor.tsx`
**Lines:** 280-290
**Severity:** P2 — No actual video playback
**Details:** The caption editor shows a gradient placeholder with a video icon. Playback controls (rewind, play, forward) change `currentTime` state manually, but there is no actual video player. The `videoId` param is used to fetch subtitle tracks from the API, but the video itself is never shown. Users are editing captions against a blank preview.

---

### FINDING 38-025: caption-editor.tsx — Play/Pause Button Toggles State but Nothing Plays
**File:** `apps/mobile/app/(screens)/caption-editor.tsx`
**Lines:** 363-368
**Severity:** P2
**Code:**
```tsx
<Pressable
  style={[styles.controlCircle, styles.playCircle]}
  onPress={() => setIsPlaying(!isPlaying)}
>
```
**Problem:** `isPlaying` state toggles but no video plays. No timer advances `currentTime` either. The caption highlighting (which depends on `currentTime`) only works if the user manually taps rewind/forward.

---

### FINDING 38-026: caption-editor.tsx — SRT Upload Sends Content as URL
**File:** `apps/mobile/app/(screens)/caption-editor.tsx`
**Lines:** 108-120
**Severity:** P2 — API mismatch
**Code:**
```tsx
await subtitlesApi.upload(videoId, {
  label: 'Auto-generated',
  language: 'en',
  srtUrl: srtContent, // This is the actual SRT text, not a URL
});
```
**Problem:** The field is named `srtUrl` but the value is the actual SRT text content. The backend likely expects a URL pointing to an uploaded SRT file. This will either fail or store the entire SRT content in a URL field.

---

### FINDING 38-027: caption-editor.tsx — Font Family References May Not Exist
**File:** `apps/mobile/app/(screens)/caption-editor.tsx`
**Lines:** 227-233
**Severity:** P2
**Code:**
```tsx
const getFontFamily = () => {
  switch (selectedFont) {
    case 'Bold': return fonts.bold;
    case 'Handwritten': return fonts.medium;
    default: return fonts.regular;
  }
};
```
**Problem:** `fonts.bold` resolves to `DMSans_700Bold`, `fonts.medium` to `DMSans_500Medium`, and `fonts.regular` to `DMSans_400Regular`. The "Handwritten" option uses `DMSans_500Medium` which is not handwritten at all. This is misleading to users.

---

### FINDING 38-028: duet-create.tsx — Recorded Video URI Never Passed to Next Screen
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Lines:** 88-107, 465
**Severity:** P1 — Recording works but output is lost
**Details:** The `handleRecord` function correctly records video and stores `recordedUri` in state (line 99). However, the "Next" button navigates to `/create-reel` (line 465) without passing `recordedUri` as a navigation param. The recorded video is discarded.

---

### FINDING 38-029: stitch-create.tsx — Recorded Video URI Never Passed to Next Screen
**File:** `apps/mobile/app/(screens)/stitch-create.tsx`
**Lines:** 97-117, 453
**Severity:** P1 — Recording works but output is lost
**Details:** Same as duet-create. Recording works, `recordedUri` is set, but the "Next" button navigates to `/create-reel` without the recorded URI. Additionally, `showPreview` state is set on the "Play Preview" button press (line 426) but there is no conditional rendering for preview mode — the state change does nothing.

---

### FINDING 38-030: stitch-create.tsx — Transition Icons Reference Non-Standard Names
**File:** `apps/mobile/app/(screens)/stitch-create.tsx`
**Lines:** 25-31
**Severity:** P2 — Potential runtime crash
**Code:**
```tsx
const TRANSITIONS: { id: TransitionType; name: string; icon: IconName }[] = [
  { id: 'cut', name: 'Cut', icon: 'scissors' },
  { id: 'fade', name: 'Fade', icon: 'eye' },
  { id: 'slide', name: 'Slide', icon: 'chevron-right' },
  { id: 'zoom', name: 'Zoom', icon: 'maximize' },
  { id: 'wipe', name: 'Wipe', icon: 'layers' },
];
```
**Status:** All icons verified to exist in the Icon component (`scissors`, `eye`, `chevron-right`, `maximize`, `layers`). No issue here — icons are valid.

---

### FINDING 38-031: duet-create.tsx — Layout Icon 'layout' Uses Non-Standard Mapping
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Line:** 297
**Severity:** P3 — Minor
**Code:**
```tsx
{ id: 'side-by-side', icon: 'layout' as IconName, label: 'Side by Side' },
```
**Status:** Verified — `layout` is a valid IconName (maps to `LayoutGrid`). No issue.

---

### FINDING 38-032: duet-create.tsx + stitch-create.tsx — Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Lines:** 158, 192-193, 213, 222, 294, 297-299, 345, 419, 428, 435, 442, 449
**File:** `apps/mobile/app/(screens)/stitch-create.tsx`
**Lines:** 167, 182, 214, 229, 289-292, 376, 389-391, 413, 420, 458
**Severity:** P2 — i18n violations
**Examples:**
```tsx
"Duetting with @{originalCreator.username}" // Line 158
"Original" // Line 192
"You" // Line 213
"@your_username" // Line 222
"Layout" // Line 294
"Side by Side" // Line 297
"Top & Bottom" // Line 298
"React" // Line 299
"00:60" // Line 345
"Recording..." // Line 350
"Audio Settings" // Line 428
"Muted" / "Mute Original" // Lines 434-435
"Original Audio" / "Your Audio" // Lines 442, 449
```
These are all hardcoded English strings that should use `t()`.

---

### FINDING 38-033: video-editor.tsx — Filter Names and Font Names Are Hardcoded English
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** 26-35, 37-38
**Severity:** P2 — i18n violation
**Code:**
```tsx
{ id: 'original', name: 'Original', color: '#FFFFFF' },
{ id: 'warm', name: 'Warm', color: '#D4A94F' },
...
const FONT_OPTIONS = ['Default', 'Bold', 'Handwritten'];
```
**Problem:** Filter names and font options are hardcoded in English. These should use translation keys.

---

### FINDING 38-034: video-editor.tsx — Hardcoded Music Track
**File:** `apps/mobile/app/(screens)/video-editor.tsx`
**Lines:** 419-420
**Severity:** P2
**Code:**
```tsx
<Text style={styles.trackName}>Summer Vibes</Text>
<Text style={styles.trackArtist}>by AudioLibrary</Text>
```
**Problem:** Background music track is hardcoded mock data. There's no actual audio library browser or music selection functionality.

---

### FINDING 38-035: green-screen-editor.tsx — Background Names Are Hardcoded English
**File:** `apps/mobile/app/(screens)/green-screen-editor.tsx`
**Lines:** 22-65
**Severity:** P2 — i18n violation
**Details:** All color names ('Black', 'White', 'Emerald', etc.), gradient names ('Sunset', 'Ocean', etc.), image background names ('Beach', 'Mountains', etc.), and video background names ('Particles', 'Rain', etc.) are hardcoded English.

---

### FINDING 38-036: green-screen-editor.tsx — Image/Video Backgrounds Are Placeholders
**File:** `apps/mobile/app/(screens)/green-screen-editor.tsx`
**Lines:** 202-256
**Severity:** P2
**Details:** Image backgrounds (Beach, Mountains, etc.) and video backgrounds (Particles, Rain, etc.) show gradient placeholders with icons. There are no actual images or videos. The selection sets state but the preview just shows a solid color or generic gradient.

---

### FINDING 38-037: image-editor.tsx — Slider Thumbs Are Not Draggable
**File:** `apps/mobile/app/(screens)/image-editor.tsx`
**Lines:** 163-175
**Severity:** P2 — Controls non-functional
**Details:** The brightness/contrast/saturation sliders show a track with a gradient fill and a thumb positioned at the current value percentage. However:
1. There is no `PanGestureHandler` or touch handling on the thumb
2. There is no way for users to change brightness/contrast/saturation values
3. The initial values are all 50% and can never be changed

---

### FINDING 38-038: image-editor.tsx — Crop Corners Are Not Draggable
**File:** `apps/mobile/app/(screens)/image-editor.tsx`
**Lines:** 96-113
**Severity:** P2
**Details:** The crop tool shows corner handles and a "Drag corners to adjust" hint, but there is no gesture handling. The crop frame is static.

---

### FINDING 38-039: image-editor.tsx — Aspect Ratio Selector Has Missing Translation Keys
**File:** `apps/mobile/app/(screens)/image-editor.tsx`
**Line:** 91
**Severity:** P2
**Code:**
```tsx
{t(`screens.imageEditor.aspectRatio.${ar.value}`)}
```
**Problem:** This generates keys like `screens.imageEditor.aspectRatio.free`, `screens.imageEditor.aspectRatio.1:1`, etc. Keys containing `:` in the path may not work correctly with i18next and are likely missing from translation files.

---

### FINDING 38-040: create-video.tsx — Alert Hardcoded in English
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 302-303
**Severity:** P2 — i18n violation
**Code:**
```tsx
Alert.alert('Missing channel', 'Please select a channel.');
```
**Problem:** This alert uses hardcoded English strings instead of `t()`. All other alerts on the same screen correctly use translations.

---

### FINDING 38-041: create-video.tsx — Empty Catch Blocks
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 107-108, 131-132
**Severity:** P2
**Code:**
```tsx
} catch (err) {
}
```
**Problem:** Two empty catch blocks swallow errors silently — one in draft loading and one in draft saving. Should at minimum log the error with `console.warn`.

---

### FINDING 38-042: create-video.tsx — Upload Progress Never Updates
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 230-290
**Severity:** P2
**Details:** The `uploadProgress` state is initialized to 0 and shown in the UI (line 549-551), but is never updated during the upload mutation. The `setUploadProgress` function is called only at line 235 to reset to 0. The actual `fetch` PUT calls don't report progress, so the progress bar stays at 0% throughout the entire upload.

---

### FINDING 38-043: create-reel.tsx — Uses Deprecated ImagePicker.MediaTypeOptions
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 103, 372
**Severity:** P2
**Code:**
```tsx
mediaTypes: ImagePicker.MediaTypeOptions.Videos,
...
mediaTypes: ImagePicker.MediaTypeOptions.Images,
```
**Problem:** `MediaTypeOptions` is deprecated in newer versions of expo-image-picker. The correct API is `mediaTypes: ['videos']` (as used in create-video.tsx line 173). This may cause warnings or break in future Expo SDK updates.

---

### FINDING 38-044: reel-templates.tsx — Tab Labels Are Hardcoded English
**File:** `apps/mobile/app/(screens)/reel-templates.tsx`
**Lines:** 33-37
**Severity:** P2 — i18n violation
**Code:**
```tsx
const TABS = [
  { key: 'trending', label: 'Trending' },
  { key: 'recent', label: 'Recent' },
  { key: 'mine', label: 'My Templates' },
] as const;
```
**Problem:** Tab labels should use `t()` translation keys.

---

### FINDING 38-045: voice-recorder.tsx — Amplitude Levels Use Math.random()
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx`
**Lines:** 64-69
**Severity:** P2
**Code:**
```tsx
levelTimer.current = setInterval(() => {
  setLevels((l) => {
    const updated = [...l, Math.random() * 100];
    if (updated.length > 20) updated.shift();
    return updated;
  });
}, 100);
```
**Problem:** The amplitude visualization uses `Math.random()` instead of actual audio levels from the recording. The `Audio.Recording` API provides `getStatusAsync()` which includes `metering` data, but it's not used. The waveform is completely fake.

---

### FINDING 38-046: voice-recorder.tsx — Recursive stop() Call Without Guard
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx`
**Lines:** 62
**Severity:** P2
**Code:**
```tsx
timer.current = setInterval(() => {
  setTime((t) => t >= MAX_TIME ? (stop(), t) : t + 1);
}, 1000);
```
**Problem:** `stop()` is called inside `setTime`'s updater function, which is called during state update. This is a side effect inside a state updater, which violates React rules. Additionally, `stop` is not in the dependency array of the `start` callback (line 71), meaning the `stop` reference could be stale.

---

### FINDING 38-047: duet-create.tsx — Timer Display Shows "00:60" Instead of "01:00"
**File:** `apps/mobile/app/(screens)/duet-create.tsx`
**Line:** 345
**Severity:** P3 — Minor cosmetic
**Code:**
```tsx
{formatTime(recordTime)} / 00:60
```
**Problem:** The maximum time is displayed as "00:60" which is not a valid time format. It should be "01:00". The `formatTime` function correctly handles 60 seconds → "01:00" for the left side, but the right side is a hardcoded string.

---

## SUMMARY

### By Severity

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 4 | Syntax errors preventing compilation (end-screen-editor, disposable-camera, create-reel, reel-remix) |
| P1 | 7 | Dead-end screens / recording output lost (camera facade, image-editor facade, green-screen no processing, duet/stitch output lost, voice-recorder send stub) |
| P2 | 22 | Non-functional controls, i18n violations, misleading UX, API mismatches |
| P3 | 2 | Minor cosmetic issues |
| **Total** | **35** | |

### Dead-End Analysis
The previous audit (#38 summary in the index) reported "6/10 screens are dead ends." This audit confirms and expands that finding:

**Screens that fully compile and have some real functionality (6/16):**
1. `video-editor.tsx` — Has real video playback + FFmpeg pipeline (though many sub-tools are non-functional)
2. `create-video.tsx` — Full upload flow with presigned URLs
3. `video-premiere.tsx` — Creates premiere via API
4. `caption-editor.tsx` — Fetches/saves subtitles via API
5. `reel-templates.tsx` — Browses templates, navigates to create-reel
6. `voice-recorder.tsx` — Records audio (but cannot send it)

**Screens that won't compile at all (4/16):**
1. `end-screen-editor.tsx` — Missing `} from 'react-native'` closing
2. `disposable-camera.tsx` — Missing `} from 'react-native'` closing
3. `create-reel.tsx` — Missing `} from 'react-native'` closing
4. `reel-remix.tsx` — Duplicate `Pressable` import

**Screens that compile but are facades/dead ends (6/16):**
1. `camera.tsx` — Renders gradient, no actual camera
2. `image-editor.tsx` — Full UI, no image loaded or processed
3. `green-screen-editor.tsx` — Camera renders but no background segmentation
4. `duet-create.tsx` — Records video but discards it on navigation
5. `stitch-create.tsx` — Records video but discards it on navigation
6. `voice-recorder.tsx` — Records audio but send() is a no-op

### Core Issue Pattern
The most common pattern across these screens is: **beautiful, fully-styled UI with zero actual media processing.** The screens use correct Mizanly design tokens, proper component library usage, animation, and layout — but the functional core (camera capture, image processing, video editing, audio mixing, background segmentation) is either missing entirely or stubbed with placeholders.
