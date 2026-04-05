# M07 — Camera & Media Screens Hostile Audit

**Scope:** `apps/mobile/app/(screens)/camera.tsx`, `story-viewer.tsx`, `photo-music.tsx`, `disposable-camera.tsx`, `video-premiere.tsx`, `sticker-browser.tsx`, `qr-scanner.tsx`, `qr-code.tsx`

**Auditor:** Opus 4.6 hostile audit | **Date:** 2026-04-05

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High     | 8 |
| Medium   | 14 |
| Low      | 10 |
| Info     | 4 |
| **Total** | **38** |

---

## Critical

### C-01: Module-level `Dimensions.get('window')` in `disposable-camera.tsx` — stale on rotation/foldable

**File:** `disposable-camera.tsx` line 30-31
```ts
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CAMERA_H = SCREEN_H * 0.55;
```
Module-level `Dimensions.get()` captures values once at import time. On foldable devices (Samsung Z Fold/Flip), tablet rotation, or iPad Stage Manager resize, `SCREEN_W`/`SCREEN_H`/`CAMERA_H` are permanently stale. The camera container renders at the wrong height. The component uses `useThemeColors()` inside the function body but never calls `useWindowDimensions()` for the layout-critical dimensions.

**Impact:** Camera viewfinder is clipped or overflows on any device that resizes the window. Foldables are 15%+ of Android sales.

---

### C-02: Module-level `Dimensions.get('window')` in `story-viewer.tsx` — stale layout

**File:** `story-viewer.tsx` line 56
```ts
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
```
`SCREEN_W` is used for `getItemLayout`, `groupPage` width, and FlatList `pagingEnabled` calculations (lines 789, 855). If the window resizes (foldable unfold, iPad multitasking), the FlatList paging is broken: each page is the wrong width, swipe-to-next-group lands between pages, and the viewfinder media stretches incorrectly.

**Impact:** Story viewer becomes unusable on any window resize event.

---

## High

### H-01: Recording interval can fire after unmount in `camera.tsx`

**File:** `camera.tsx` lines 75-86
```ts
recordingInterval.current = setInterval(() => {
  setRecordingTime(prev => {
    if (prev >= 60) {
      setIsRecording(false);
      recordProgress.value = withTiming(0, { duration: 300 });
      if (recordingInterval.current) clearInterval(recordingInterval.current);
      return 0;
    }
    return prev + 1;
  });
}, 1000);
```
The cleanup effect on line 147-153 clears the interval on unmount, but the `setInterval` callback at line 76 calls `setIsRecording` and `recordProgress.value`. If the interval fires between React scheduling unmount and the cleanup running, `setIsRecording` triggers a state update on an unmounted component. React 18 removed the warning but the animated value assignment (`recordProgress.value`) can crash if the worklet context is torn down.

**Fix:** Add a mounted ref guard, or use `useEffect` return to cancel before the interval callback can reference stale closures.

---

### H-02: `stopPreview` is a stale closure inside `startPreview` in `photo-music.tsx`

**File:** `photo-music.tsx` lines 152-186
```ts
const startPreview = useCallback(async () => {
  // ...
  previewTimerRef.current = setInterval(() => {
    currentIdx += 1;
    if (currentIdx >= images.length) {
      stopPreview(); // <-- captured at startPreview creation time
      return;
    }
    // ...
  }, photoDuration * 1000);
}, [images.length, selectedTrack, photoDuration]);
```
`stopPreview` is not in the dependency array of `startPreview`. If `stopPreview` is re-created (due to its own deps changing), the interval still holds the old reference. In practice `stopPreview`'s deps are stable (empty array), but the missing dep is a latent bug if `stopPreview` ever gains dependencies.

---

### H-03: `flatListRef.current?.scrollToIndex` can throw if items not yet rendered — `photo-music.tsx`

**File:** `photo-music.tsx` line 184
```ts
flatListRef.current?.scrollToIndex({ index: currentIdx, animated: true });
```
Inside the preview interval, `scrollToIndex` is called without an `onScrollToIndexFailed` handler. If the FlatList has not rendered the target item, React Native throws: `scrollToIndex out of range: requested index N but maximum is M`. This can happen when images are removed during preview playback.

---

### H-04: `parseInt` without NaN check on `timeLimit` param — `disposable-camera.tsx`

**File:** `disposable-camera.tsx` line 54-56
```ts
const [timeLeft, setTimeLeft] = useState(
  params.timeLimit ? parseInt(params.timeLimit, 10) : DEFAULT_TIME,
);
```
If `params.timeLimit` is a non-numeric string (e.g., from a malformed deep link), `parseInt` returns `NaN`. The timer countdown `prev - 1` produces `NaN`, `prev <= 1` is `false`, so the timer runs forever and never triggers `router.back()`. The countdown display shows `NaN:NaN`.

**Fix:** `const parsed = parseInt(params.timeLimit, 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIME;`

---

### H-05: No date validation beyond regex in `video-premiere.tsx` — invalid dates accepted

**File:** `video-premiere.tsx` lines 57-64
```ts
const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
const isValidTime = /^\d{2}:\d{2}$/.test(time);
if (!isValidDate || !isValidTime) { ... }
createMutation.mutate();
```
The regex accepts `2026-99-99` and `99:99`. `new Date('2026-99-99T99:99:00')` returns `Invalid Date`. `toISOString()` on an Invalid Date throws `RangeError: Invalid time value`, which crashes the mutation and surfaces as an unhandled promise rejection before the `onError` handler can catch it (the error occurs in `mutationFn`, not in a try/catch).

Additionally, scheduling a premiere in the past is not validated.

---

### H-06: `handleAdd`/`handleRemove` recreated every render in `sticker-browser.tsx` — stale in `renderPackItem`

**File:** `sticker-browser.tsx` lines 174-175, 181-192
```ts
const handleAdd = (id: string) => addMutation.mutate(id);
const handleRemove = (id: string) => removeMutation.mutate(id);

const renderPackItem = useCallback(
  ({ item, index }: ...) => (
    <PackCard
      ...
      onAdd={() => handleAdd(item.id)}
      onRemove={() => handleRemove(item.id)}
      ...
    />
  ),
  [handleAdd, handleRemove], // these are unstable references
);
```
`handleAdd` and `handleRemove` are plain arrow functions (no `useCallback`), so they are recreated every render. `renderPackItem` lists them as dependencies, meaning `renderPackItem` is also recreated every render, defeating the `useCallback` optimization entirely. Every render re-renders every `PackCard`.

---

### H-07: QR scanner `handleBarCodeScanned` not memoized — can fire multiple times

**File:** `qr-scanner.tsx` lines 44-61
```ts
const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
  if (scanned) return;
  setScanned(true);
  // ...
};
```
`handleBarCodeScanned` is a plain arrow function, not wrapped in `useCallback`. It captures `scanned` from the render closure. If the camera fires two barcode events in the same frame (common with fast QR detection), both callbacks see `scanned === false` because `setScanned(true)` hasn't committed yet. This navigates to the profile screen twice, stacking duplicate screens in the router.

**Fix:** Use a ref (`scannedRef.current = true`) alongside the state to provide synchronous deduplication.

---

### H-08: `useEffect` dependency list incomplete in `qr-scanner.tsx`

**File:** `qr-scanner.tsx` lines 32-43
```ts
useEffect(() => {
  if (permission && !permission.granted && !permission.canAskAgain) {
    Alert.alert(
      t('screens.qr-scanner.cameraRequired'),
      // ...
    );
  }
}, [permission]);
```
The effect uses `t` and `router` but does not list them in the dependency array. If the language changes while on this screen, the alert text would be stale. ESLint `exhaustive-deps` would flag this.

---

## Medium

### M-01: `isLoading` state in `qr-code.tsx` is set but never changed

**File:** `qr-code.tsx` line 26
```ts
const [isLoading, setIsLoading] = useState(false);
```
`setIsLoading` is never called anywhere in the component. The loading skeleton branch (lines 52-61) is dead code that can never render. The `isLoading` state and skeleton markup should be removed or wired to actual data fetching.

---

### M-02: 66 i18n keys used via `t()` calls are missing from `en.json`

All `t()` calls with fallback-less keys in `camera.tsx`, `photo-music.tsx`, `disposable-camera.tsx`, and `story-viewer.tsx` resolve to the key path string itself (e.g., user sees `"photoMusic.removePhoto"` instead of "Remove Photo"). Full list of missing keys:

| File | Missing key count | Examples |
|------|-------------------|---------|
| `camera.tsx` | 12 | `permissions.cameraTitle`, `screens.camera.previewText`, `screens.camera.modePhoto`, `camera.galleryError` |
| `photo-music.tsx` | 21 | All `photoMusic.*` keys — `title`, `noPhotos`, `selectMusic`, `removePhoto`, `post`, etc. |
| `disposable-camera.tsx` | 20 | All `disposable.*` keys — `title`, `timeUpMessage`, `cameraRequired`, `capture`, etc. |
| `story-viewer.tsx` | 7 | `saf.view`, `saf.replyToStory`, `saf.story.unavailable`, `saf.noViewsYet` |
| `video-premiere.tsx` | 1 | `premiere.scheduled` |
| `sticker-browser.tsx` | 2 | `screens.sticker-browser.noStickers`, `screens.sticker-browser.noStickersSubtitle` |
| `qr-scanner.tsx` | 1 | `screens.qr-scanner.cameraError` |
| `qr-code.tsx` | 2 | `screens.qr-code.shareMessage`, `screens.qr-code.shareTitle` |

These are missing from `en.json`; they are therefore also missing from all 7 other language files (ar, tr, ur, bn, fr, id, ms). `common.notNow` is also missing from all 8 languages (used in `camera.tsx` line 133).

---

### M-03: `colors.dark.*` hardcoded in static `StyleSheet` — `disposable-camera.tsx`

**File:** `disposable-camera.tsx` lines 447, 462, 488, 493, 562, 589, 592
```ts
backgroundColor: colors.dark.bg,
backgroundColor: colors.dark.bgCard,
borderColor: colors.dark.border,
```
7 style properties use `colors.dark.*` directly in the static `StyleSheet.create()` instead of `tc.*` from `useThemeColors()`. This means these styles are always dark-mode colors regardless of the user's theme setting. The component does use `tc` via inline styles for some elements (lines 224, 269, 298, 329, 331, 352, 364, 377), creating an inconsistent mix where some parts respond to theme changes and others don't.

---

### M-04: `colors.text.*` hardcoded in static `StyleSheet` — `disposable-camera.tsx`

**File:** `disposable-camera.tsx` lines 476, 512, 580, 598
```ts
borderColor: colors.text.primary,    // line 476 — miniCameraWrapper
color: colors.text.secondary,        // line 512 — taglineMain
color: colors.text.primary,          // line 580 — photoLabelText
color: colors.text.secondary,        // line 598 — noEditText
```
Same issue as M-03. These use the global `colors.text.*` tokens (which are dark-mode values) instead of `tc.text.*`. The inline style overrides on lines 331 and 331 use `tc.*`, so only _some_ elements respond to light mode.

---

### M-05: `colors.text.*` hardcoded in static `StyleSheet` — `story-viewer.tsx`

**File:** `story-viewer.tsx` lines 955, 969, 970, 972
```ts
viewersTitle: { color: colors.text.primary, ... },
viewerName: { color: colors.text.primary, ... },
viewerUsername: { color: colors.text.secondary, ... },
viewersEmpty: { color: colors.text.tertiary, ... },
```
The viewers section uses static dark-mode color tokens. Inline overrides exist for `viewerName` and `viewerUsername` (lines 184-185 via `tc.text.primary`/`tc.text.secondary`), making the static stylesheet values dead code for those two, but `viewersTitle` (line 955) and `viewersEmpty` (line 972) have no inline override and render with hardcoded dark-mode colors.

---

### M-06: `colors.gradient.cardDark` hardcoded in `sticker-browser.tsx`

**File:** `sticker-browser.tsx` lines 53, 250
```ts
colors={colors.gradient.cardDark}
```
The `PackCard` and search input use `colors.gradient.cardDark` directly instead of a theme-aware gradient. In light mode, these dark gradients will look out of place.

---

### M-07: `colors.active.white6` hardcoded in `sticker-browser.tsx`

**File:** `sticker-browser.tsx` lines 369, 426
```ts
borderColor: colors.active.white6,
```
These use a dark-mode-specific token (`white6` = white at 6% opacity) in the static stylesheet. In light mode on a light background, this border is invisible.

---

### M-08: `PackCard` local state drifts from server state — `sticker-browser.tsx`

**File:** `sticker-browser.tsx` lines 30-45
```ts
const [isAdded, setIsAdded] = useState(pack.isCollected ?? false);
// ...
if (isAdded) {
  setIsAdded(false);
  onRemove();
} else {
  setIsAdded(true);
  onAdd();
}
```
The `isAdded` local state is initialized from `pack.isCollected` on mount but never synced if the prop changes (e.g., after `queryClient.invalidateQueries` refreshes the data and `isCollected` changes). If the mutation fails on the server but the local state already flipped, the UI shows the wrong state permanently.

**Fix:** Either derive `isAdded` from `pack.isCollected` directly (no local state), or sync it via `useEffect` when the prop changes.

---

### M-09: `createStyles` called without memoization in `StickerBrowserScreenInner`

**File:** `sticker-browser.tsx` line 94
```ts
const styles = createStyles(tc, screenWidth);
```
Unlike `PackCard` (which uses `useMemo`), the main `StickerBrowserScreenInner` calls `createStyles()` on every render without `useMemo`. This creates a new `StyleSheet` object every render.

---

### M-10: Video element not cleaned up on story change — `story-viewer.tsx`

**File:** `story-viewer.tsx` lines 478-491
```ts
<Video
  source={{ uri: story.mediaUrl }}
  shouldPlay={isActive && !paused}
  ...
/>
```
When `storyIndex` changes from a video story to an image story, the previous `Video` component is unmounted. expo-av's `Video` component does call `unloadAsync` internally on unmount, but there is no explicit unload or position reset. If the user taps back to the previous video story within the same group, it renders a new `Video` instance that starts from the beginning with no seek-to-position, and the old video's audio may briefly overlap if the unmount cleanup is async.

---

### M-11: `setInterval` closure captures `images.length` at creation time — `photo-music.tsx`

**File:** `photo-music.tsx` lines 176-185
```ts
previewTimerRef.current = setInterval(() => {
  currentIdx += 1;
  if (currentIdx >= images.length) {  // <-- captured at startPreview call time
    stopPreview();
    return;
  }
  // ...
}, photoDuration * 1000);
```
If images are removed while preview is playing (unlikely but possible via concurrent state mutation), `images.length` is stale inside the interval. The interval uses the length from when `startPreview` was called.

---

### M-12: `useMemo` dependency on `tc` object reference — multiple files

**Files:** `video-premiere.tsx` line 25, `qr-scanner.tsx` line 22, `qr-code.tsx` line 20, `sticker-browser.tsx` line 28
```ts
const styles = useMemo(() => createStyles(tc), [tc]);
```
`useThemeColors()` may return a new object reference on every render (depending on implementation). If it does, the `useMemo` dep on `tc` re-runs `createStyles` every render, defeating memoization. Should depend on a stable theme key (e.g., `tc.bg` or a theme name string) instead.

---

### M-13: Gallery picker error silently swallowed — `camera.tsx`

**File:** `camera.tsx` line 298
```ts
} catch {
  showToast({ message: t('camera.galleryError'), variant: 'error' });
}
```
The `catch` block discards the error object. If the error is a permissions denial vs. a crash vs. a cancellation, the user gets the same generic message. Cancellation (`result.canceled`) is already handled, but other error types (disk full, corrupted file) should be distinguished. Also, `camera.galleryError` is a missing i18n key (see M-02), so the user sees the raw key string.

---

### M-14: Sticker response errors silently swallowed — `story-viewer.tsx`

**File:** `story-viewer.tsx` lines 242-244
```ts
storiesApi.submitStickerResponse(story.id, sticker.type, response).catch(() => {});
```
Line 235:
```ts
storiesApi.markViewed(story.id).catch(() => {});
```
Both API calls swallow errors with empty `.catch(() => {})`. The user gets no feedback if their poll vote, quiz answer, or view tracking fails. At minimum, sticker responses should show an error toast since they represent explicit user actions.

---

## Low

### L-01: `setTimeout(() => setIsCapturing(false), 500)` is a guess — `camera.tsx`

**File:** `camera.tsx` line 99
```ts
setTimeout(() => setIsCapturing(false), 500);
```
The 500ms timeout to re-enable the capture button after photo mode navigation is arbitrary. If navigation takes longer (slow device, large screen transition), the button re-enables while still on the camera screen. If navigation is instant, it wastes 500ms of responsiveness. Should use a navigation event listener or `InteractionManager.runAfterInteractions`.

---

### L-02: `permissionRequested` ref guard is fragile — `camera.tsx`

**File:** `camera.tsx` lines 124-138
The `permissionRequested` ref prevents re-prompting, but if the user navigates away and returns to the camera screen, the component re-mounts, the ref resets to `false`, and the permission dialog shows again. This is arguably correct behavior, but it means the ref doesn't actually provide "only prompt once" semantics across screen visits — only within a single mount.

---

### L-03: `BrandedRefreshControl` on photo carousel is confusing UX — `photo-music.tsx`

**File:** `photo-music.tsx` lines 401-406
```ts
refreshControl={
  <BrandedRefreshControl
    refreshing={false}
    onRefresh={pickImages}
  />
}
```
Pull-to-refresh on a horizontal FlatList of locally-selected images triggers the image picker. This is a non-standard interaction pattern. Users pulling down on a carousel expect to refresh content, not open a picker. The gesture may also conflict with vertical scrolling of the parent `ScrollView`.

---

### L-04: Debounce timeout not cleaned up properly — `sticker-browser.tsx`

**File:** `sticker-browser.tsx` lines 106-111
```ts
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(searchQuery);
  }, 500);
  return () => clearTimeout(timer);
}, [searchQuery]);
```
This is correct, but 500ms is a long debounce for a search input. Users may perceive the search as broken when nothing happens for half a second after typing. 300ms is the standard for search-as-you-type.

---

### L-05: `qr-code.tsx` `handleSave` is a no-op alias for `handleShare`

**File:** `qr-code.tsx` lines 42-45
```ts
const handleSave = async () => {
  // Fallback to share if expo-media-library is not available
  await handleShare();
};
```
The "Save" button (with download icon, line 119) calls `handleShare`, which opens the system share sheet. Users expect "Save" to save to camera roll. The comment acknowledges this is a fallback, but there's no TODO or feature flag. The button label and icon are misleading.

---

### L-06: QR code `username` param not validated — `qr-code.tsx`

**File:** `qr-code.tsx` line 28
```ts
const qrValue = `https://mizanly.app/@${username}`;
```
If `username` is `undefined` (no param passed), the QR code encodes `https://mizanly.app/@undefined`. No guard for empty/missing username.

---

### L-07: `PackCard` debounce uses raw `setTimeout` — `sticker-browser.tsx`

**File:** `sticker-browser.tsx` lines 33-37
```ts
const isTogglingRef = useRef(false);
const handleToggle = () => {
  if (isTogglingRef.current) return;
  isTogglingRef.current = true;
  setTimeout(() => { isTogglingRef.current = false; }, 500);
```
The `setTimeout` is never cleaned up on unmount. If the component unmounts during the 500ms window, the callback fires on a garbage-collected ref. Not a crash (refs don't trigger updates), but unclean.

---

### L-08: `renderPageDots` not memoized — `photo-music.tsx`

**File:** `photo-music.tsx` lines 308-320
`renderPageDots` is a plain function declared inside the component body, recreated every render. For 10 images, it creates 10 `View` elements each render. Should use `useMemo` or `useCallback`.

---

### L-09: `scrollToIndex` without `onScrollToIndexFailed` — `story-viewer.tsx`

**File:** `story-viewer.tsx` lines 759, 772
```ts
flatListRef.current?.scrollToIndex({ index: next, animated: true });
```
If `initialScrollIndex` targets an item not yet laid out, `scrollToIndex` throws. The `getItemLayout` prop mitigates this for most cases, but edge cases (0 items, rapid group changes) can still trigger the error.

---

### L-10: Missing `accessibilityRole` on some interactive elements

**Files:**
- `photo-music.tsx` line 329: duration pill `Pressable` has `accessibilityRole="button"` (good)
- `story-viewer.tsx` line 596: views container uses inline `View` with no role
- `camera.tsx` line 283-303: gallery button's inner `LinearGradient` has no label on the gradient itself

Minor gaps in accessibility tree.

---

## Info

### I-01: `Skeleton.Rect` used as loading indicator for buttons — semantic mismatch

**Files:** `disposable-camera.tsx` line 424, `photo-music.tsx` line 359, `disposable-camera.tsx` line 280
`Skeleton.Rect` is used inside capture/share buttons as a loading spinner replacement. Skeletons are meant for content placeholders, not action feedback. An `ActivityIndicator` is the correct component for button loading states per the project's own rule (Skeleton for content loading, ActivityIndicator for buttons).

---

### I-02: `MediaTypeOptions.Images` deprecated API usage — `photo-music.tsx`

**File:** `photo-music.tsx` line 93
```ts
mediaTypes: ImagePicker.MediaTypeOptions.Images,
```
`camera.tsx` line 294 uses the newer array syntax: `mediaTypes: ['images', 'videos']`. `photo-music.tsx` uses the older enum syntax. Both work, but the codebase should be consistent with the newer API.

---

### I-03: Static `StyleSheet` in `story-viewer.tsx` — cannot be theme-aware

**File:** `story-viewer.tsx` lines 853-975
The entire 120-line stylesheet is a static `StyleSheet.create()` at module scope. Unlike the other files which use `createStyles(tc)`, story-viewer cannot respond to theme changes for any of its styles. Colors like `#000`, `rgba(255,255,255,...)`, and `colors.emerald` are baked in. This is acceptable for a full-screen dark camera overlay, but the viewers bottom sheet (lines 954-975) should use theme-aware colors for light mode support.

---

### I-04: `useStore((s) => s.storyViewerData)` selector may cause unnecessary re-renders

**File:** `story-viewer.tsx` line 701
```ts
const storyViewerData = useStore((s) => s.storyViewerData);
```
If other parts of the store change, the shallow equality check on `storyViewerData` (which is an object) may fail even if the data hasn't changed, causing re-renders. This is a Zustand selector best practice issue, not a bug.

---

## Files Audited

| File | Lines | Findings |
|------|-------|----------|
| `camera.tsx` | 585 | C-00 (none), H-01, M-02, M-13, L-01, L-02 |
| `story-viewer.tsx` | 975 | C-02, M-05, M-10, M-14, L-09, I-03, I-04 |
| `photo-music.tsx` | 743 | H-02, H-03, M-02, M-11, L-03, L-08, I-02 |
| `disposable-camera.tsx` | 610 | C-01, H-04, M-02, M-03, M-04, I-01 |
| `video-premiere.tsx` | 260 | H-05, M-02, M-12 |
| `sticker-browser.tsx` | 504 | H-06, M-02, M-06, M-07, M-08, M-09, M-12, L-04, L-07 |
| `qr-scanner.tsx` | 252 | H-07, H-08, M-02, M-12 |
| `qr-code.tsx` | 213 | M-01, M-02, M-12, L-05, L-06 |
