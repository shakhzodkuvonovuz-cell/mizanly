# Agent #27 — Accessibility Audit

**Scope:** Mobile UI components (`apps/mobile/src/components/ui/`), 5 tab screens, 30+ sampled screen files, theme color contrast analysis.

**Total Findings: 47**

---

## CATEGORY 1: WCAG Color Contrast Failures (5 findings)

### A1-01 [SEVERITY: HIGH] Tertiary text on dark background fails WCAG AA
- **File:** `apps/mobile/src/theme/index.ts`, line 43
- **Colors:** `colors.text.tertiary` (#6E7781) on `colors.dark.bg` (#0D1117)
- **Contrast ratio:** ~3.4:1 (WCAG AA requires 4.5:1 for normal text)
- **Impact:** Tertiary text is used extensively for timestamps, hints, secondary labels across all screens. Affects hundreds of text elements.
- **Code:**
  ```ts
  tertiary: '#6E7781',
  ```
- **Fix:** Lighten to at least #8B949E (~4.6:1) or use `colors.text.secondary` for important information.

### A1-02 [SEVERITY: HIGH] Secondary text on dark card background fails WCAG AA
- **File:** `apps/mobile/src/theme/index.ts`, lines 42, 16
- **Colors:** `colors.text.secondary` (#8B949E) on `colors.dark.bgCard` (#1C2333)
- **Contrast ratio:** ~3.7:1 (WCAG AA requires 4.5:1 for normal text at fontSize.sm = 13pt)
- **Impact:** Used for chat previews, subtitles, metadata text on card backgrounds. At 13pt font size this is below threshold.
- **Fix:** Lighten secondary text to #A0AAB5 when on card backgrounds, or darken card background.

### A1-03 [SEVERITY: MEDIUM] Emerald on dark background below AA for small text
- **File:** `apps/mobile/src/theme/index.ts`, line 6
- **Colors:** `colors.emerald` (#0A7B4F) on `colors.dark.bg` (#0D1117)
- **Contrast ratio:** ~3.8:1 (passes 3:1 for large text but fails 4.5:1 for small text)
- **Impact:** Hashtags, mentions, links, active states all use emerald at `fontSize.sm` (13pt). Visible in RichText.tsx (line 132-134), TabSelector.tsx active labels, and across most screens.
- **Fix:** Use `colors.emeraldLight` (#0D9B63) for small text on dark backgrounds (~4.5:1).

### A1-04 [SEVERITY: MEDIUM] Gold text on dark background below AA for small text
- **File:** `apps/mobile/src/theme/index.ts`, line 9
- **Colors:** `colors.gold` (#C8963E) on `colors.dark.bg` (#0D1117)
- **Contrast ratio:** ~4.2:1 (borderline, fails 4.5:1 for normal text)
- **Impact:** Bookmark indicators, gold badges, Zakat calculator amounts, scholar badges.
- **Fix:** Use `colors.goldLight` (#D4A94F) for text on dark backgrounds.

### A1-05 [SEVERITY: LOW] Glass overlay text near minimum contrast
- **File:** `apps/mobile/src/theme/index.ts`, line 63
- **Colors:** `colors.text.primary` (#FFFFFF) on `colors.glass.dark` (rgba(13,17,23,0.75))
- **Contrast ratio:** Variable, depends on content behind the glass. With average video content, effective contrast can drop below 4.5:1.
- **Impact:** VideoPlayer controls (lines 259-278), VideoControls icon buttons, MiniPlayer text.
- **Fix:** Increase glass.dark opacity to 0.85 minimum, or add text shadow to guarantee readability.

---

## CATEGORY 2: Missing accessibilityLabel (15 findings)

### A2-01 [SEVERITY: HIGH] Avatar component has no label when not pressable
- **File:** `apps/mobile/src/components/ui/Avatar.tsx`, line 188
- **Description:** When `onPress` is undefined, the Avatar renders as a plain `<View>` with zero accessibility information. Screen readers announce nothing.
- **Code:**
  ```tsx
  return <View style={styles.container}>{content}</View>;
  ```
- **Fix:** Add `accessibilityLabel={accessibilityLabel ?? (name ? `${name}'s avatar` : 'Avatar')}` to the View.

### A2-02 [SEVERITY: HIGH] VideoPlayer — 7 Pressable controls missing labels
- **File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`, lines 259-278
- **Description:** Loop toggle (line 259), quality selector (line 264), fullscreen button (line 274), speed button (line 277), mute button (line 298), play/pause (line 288), skip buttons (lines 285, 291) — many lack `accessibilityLabel`. Only PiP button has a label.
- **Code (loop toggle example):**
  ```tsx
  <Pressable onPress={() => { haptic.light(); setLooping(!looping); }} style={styles.iconButton}>
    <Icon name="repeat" size="md" color={looping ? colors.emerald : colors.text.primary} />
  </Pressable>
  ```
- **Fix:** Add descriptive `accessibilityLabel` and `accessibilityRole="button"` to every control.

### A2-03 [SEVERITY: HIGH] ImageLightbox — close and share buttons missing labels
- **File:** `apps/mobile/src/components/ui/ImageLightbox.tsx`, lines 206-228
- **Description:** Close button (line 206-215) and share button (line 219-228) have no `accessibilityLabel` or `accessibilityRole`.
- **Fix:** Add `accessibilityLabel="Close image"` and `accessibilityRole="button"` to close Pressable. Same for share.

### A2-04 [SEVERITY: HIGH] ImageGallery — close and share buttons missing labels
- **File:** `apps/mobile/src/components/ui/ImageGallery.tsx`, lines 246-272
- **Description:** Same as ImageLightbox — close and share buttons have no accessibility labels.
- **Fix:** Add `accessibilityLabel` and `accessibilityRole="button"` to both.

### A2-05 [SEVERITY: HIGH] ImageCarousel — image items missing labels
- **File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, lines 50-64
- **Description:** Each carousel `<Pressable>` wrapping an Image has no `accessibilityLabel`. Screen readers cannot identify what image the user is on.
- **Code:**
  ```tsx
  <Pressable style={[styles.imageWrapper, ...]} onPress={() => onImagePress?.(index)} disabled={!onImagePress}>
    <Image source={{ uri: item }} ... />
  </Pressable>
  ```
- **Fix:** Add `accessibilityLabel={`Image ${index + 1} of ${images.length}`}`.

### A2-06 [SEVERITY: HIGH] ImageCarousel dot indicators missing labels
- **File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, lines 117-123
- **Description:** Pagination dots are Pressable but have no `accessibilityLabel`.
- **Fix:** Add `accessibilityLabel={`Go to image ${index + 1}`}` and `accessibilityRole="button"`.

### A2-07 [SEVERITY: MEDIUM] EmptyState has no accessibilityLabel on container
- **File:** `apps/mobile/src/components/ui/EmptyState.tsx`, lines 19-37
- **Description:** The empty state container has no semantic role. Screen readers don't announce it as a distinct informational region.
- **Fix:** Add `accessibilityRole="header"` and `accessibilityLabel={title}` on the container or title Text.

### A2-08 [SEVERITY: MEDIUM] LinkPreview — Pressable wrapper missing label
- **File:** `apps/mobile/src/components/ui/LinkPreview.tsx`, lines 93-101, 106
- **Description:** Both error-state and normal-state Pressable wrappers lack `accessibilityLabel` and `accessibilityRole="link"`.
- **Fix:** Add `accessibilityLabel={`Link to ${metadata?.domain ?? url}`}` and `accessibilityRole="link"`.

### A2-09 [SEVERITY: MEDIUM] Autocomplete list items missing labels
- **File:** `apps/mobile/src/components/ui/Autocomplete.tsx`, lines 94, 110
- **Description:** Both hashtag and mention list items are Pressable but lack `accessibilityLabel` and `accessibilityRole`.
- **Code:**
  ```tsx
  <Pressable style={styles.item} onPress={() => handleSelect(item)}>
  ```
- **Fix:** Add `accessibilityLabel` and `accessibilityRole="button"`.

### A2-10 [SEVERITY: MEDIUM] Autocomplete close button missing label
- **File:** `apps/mobile/src/components/ui/Autocomplete.tsx`, line 126
- **Description:** Close button has no `accessibilityLabel`.
- **Code:**
  ```tsx
  <Pressable onPress={onClose} hitSlop={8}>
  ```
- **Fix:** Add `accessibilityLabel="Close suggestions"` and `accessibilityRole="button"`.

### A2-11 [SEVERITY: MEDIUM] BottomSheet backdrop close area missing label
- **File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, line 105
- **Description:** Uses `t('common.close')` which references a function `t` but the component calls `useTranslation` — however, `t` is used directly without destructuring from the hook. The import of `useTranslation` is at the top but `t` is not defined in the function scope of `BottomSheet`. This will crash at runtime.
- **Code:**
  ```tsx
  accessibilityLabel={t('common.close')}
  ```
- **Fix:** Destructure `const { t } = useTranslation();` inside the BottomSheet component, or pass a literal string.

### A2-12 [SEVERITY: MEDIUM] RichText interactive segments missing labels
- **File:** `apps/mobile/src/components/ui/RichText.tsx`, lines 54-117
- **Description:** Clickable hashtags, mentions, URLs, phone numbers, and emails are rendered as `<Text onPress={...}>` without any `accessibilityRole="link"` or `accessibilityLabel` props.
- **Fix:** Add `accessibilityRole="link"` to each interactive Text segment. Add `accessibilityLabel` like "Hashtag #name" or "Link to domain.com".

### A2-13 [SEVERITY: MEDIUM] Badge component missing accessibilityLabel
- **File:** `apps/mobile/src/components/ui/Badge.tsx`, lines 40-63
- **Description:** Badge renders a count but has no `accessibilityLabel`. Screen readers cannot announce what the count represents.
- **Fix:** Add `accessibilityLabel={`${count} notifications`}` or accept it as a prop.

### A2-14 [SEVERITY: MEDIUM] CharCountRing missing accessible description
- **File:** `apps/mobile/src/components/ui/CharCountRing.tsx`, lines 15-49
- **Description:** The character count ring is purely visual (SVG). The remaining count text (line 45) is tiny (fontSize 7) and has no `accessibilityLabel`.
- **Fix:** Add `accessibilityLabel={`${remaining} characters remaining`}` to the wrapper.

### A2-15 [SEVERITY: LOW] VerifiedBadge has no accessibilityLabel
- **File:** `apps/mobile/src/components/ui/VerifiedBadge.tsx`, lines 10-48
- **Description:** The SVG badge has no accessibility information. Screen readers skip it entirely.
- **Fix:** Wrap in a `<View accessibilityLabel="Verified account" accessibilityRole="image">`.

---

## CATEGORY 3: Touch Target Size Violations (8 findings)

### A3-01 [SEVERITY: HIGH] ImageLightbox dot indicators — 8x8pt touch targets
- **File:** `apps/mobile/src/components/ui/ImageLightbox.tsx`, lines 269-273
- **Description:** Pagination dots are 8x8pt Pressables (styles line 337-338). No `hitSlop`. This is 5.5x smaller than the 44x44pt minimum.
- **Code:**
  ```tsx
  <Pressable key={index} style={[styles.dot, ...]} onPress={() => goToIndex(index)} />
  // dot: { width: 8, height: 8, ... }
  ```
- **Fix:** Add `hitSlop={18}` to expand touch target to 44pt, or wrap in a larger container.

### A3-02 [SEVERITY: HIGH] ImageCarousel dot indicators — 8x8pt touch targets
- **File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, lines 117-123
- **Description:** Same issue as ImageLightbox — 8x8pt dots with no hitSlop.
- **Fix:** Add `hitSlop={18}`.

### A3-03 [SEVERITY: HIGH] TTSMiniPlayer speed button — ~24x24pt effective area
- **File:** `apps/mobile/src/components/ui/TTSMiniPlayer.tsx`, lines 76-83
- **Description:** Speed button has padding of `spacing.sm` (8) horizontal and `spacing.xs` (4) vertical. With small text content, the effective touch area is roughly 32x24pt. The hitSlop adds 8pt on each side but with 4pt vertical padding the vertical target is ~24pt before hitSlop.
- **Fix:** Increase `paddingVertical` to at least `spacing.sm` (8) to bring height to 32pt, where hitSlop=8 brings it to 48pt.

### A3-04 [SEVERITY: MEDIUM] TTSMiniPlayer action buttons — 36x36pt
- **File:** `apps/mobile/src/components/ui/TTSMiniPlayer.tsx`, lines 172-178
- **Description:** Play/pause and stop buttons are 36x36pt (styles line 173-174). Below 44pt minimum. hitSlop of 8 on each side brings effective target to 52pt, which is fine — but the visual target is undersized.
- **Fix:** Increase to 44x44pt or ensure hitSlop is always applied.

### A3-05 [SEVERITY: MEDIUM] EndScreenOverlay card icon — 32x32pt
- **File:** `apps/mobile/src/components/ui/EndScreenOverlay.tsx`, lines 171-172
- **Description:** Card icon container is 32x32pt. The parent Pressable is larger, so this is fine for touch but visually small.
- **Impact:** Low, since the entire card is the touch target.

### A3-06 [SEVERITY: MEDIUM] MiniPlayer action buttons — 40x40pt
- **File:** `apps/mobile/src/components/ui/MiniPlayer.tsx`, lines 364-370
- **Description:** Play/pause and close buttons are 40x40pt. Below the 44pt minimum by 4pt.
- **Fix:** Increase to 44x44pt or add hitSlop={2}.

### A3-07 [SEVERITY: HIGH] Bakra follow button on avatar — 26x26pt
- **File:** `apps/mobile/app/(tabs)/bakra.tsx`, lines 281-312
- **Description:** The follow/following button overlaid on the creator avatar is only 26x26pt. Even with `hitSlop={12}`, the visual target is extremely small (1.7x below minimum). On a bouncing reel feed, this is very difficult to tap.
- **Code:**
  ```tsx
  style={{ ... width: 26, height: 26, borderRadius: radius.full, ... }}
  ```
- **Fix:** Increase to at least 36x36pt.

### A3-08 [SEVERITY: MEDIUM] GradientButton small variant — 36pt height
- **File:** `apps/mobile/src/components/ui/GradientButton.tsx`, line 46
- **Description:** The `sm` size variant has a height of 36pt. Below 44pt minimum.
- **Impact:** Used in EmptyState action buttons and other compact contexts.
- **Fix:** Increase sm height to 40pt minimum, or ensure adequate hitSlop.

---

## CATEGORY 4: useReducedMotion Exists but Never Used (3 findings)

### A4-01 [SEVERITY: HIGH] useReducedMotion hook defined but imported by zero files
- **File:** `apps/mobile/src/hooks/useReducedMotion.ts`
- **Description:** A well-implemented `useReducedMotion` hook exists (lines 9-27) that checks both system preference (`AccessibilityInfo.isReduceMotionEnabled()`) and app setting (`store.reducedMotion`). However, **zero files in the entire codebase import or use it**. The grep search found only the definition file itself.
- **Impact:** Users who enable "Reduce Motion" in iOS/Android settings will see all animations at full intensity: spring bounces, shimmer skeletons, fade-ins, slide transitions, floating hearts, double-tap hearts, typing dots, etc. This affects users with vestibular disorders.
- **Fix:** Import and use in all animation-heavy components: FadeIn, DoubleTapHeart, FloatingHearts, Skeleton (shimmer), Badge (scale), BottomSheet (spring), VideoPlayer, and all `withSpring`/`withTiming` call sites.

### A4-02 [SEVERITY: MEDIUM] useAccessibleAnimation helper exists but also unused
- **File:** `apps/mobile/src/hooks/useReducedMotion.ts`, lines 33-45
- **Description:** The file also exports `useAccessibleAnimation()` which provides `spring` and `duration()` helpers that auto-disable animations. This is never imported anywhere.
- **Fix:** Use this in components instead of raw `animation.spring.*` constants.

### A4-03 [SEVERITY: MEDIUM] Skeleton shimmer ignores reduced motion
- **File:** `apps/mobile/src/components/ui/Skeleton.tsx`, lines 20-28
- **Description:** `ShimmerBase` uses `withRepeat(withTiming(...))` for a continuous shimmer animation that runs indefinitely. This is particularly problematic for users with motion sensitivity — the shimmer is a repeating looping animation that can trigger discomfort.
- **Fix:** Conditionally disable shimmer when `useReducedMotion()` returns true: show a static loading state instead.

---

## CATEGORY 5: Images Without Alt Text (4 findings)

### A5-01 [SEVERITY: HIGH] All expo-image `<Image>` instances missing accessibilityLabel
- **Files:** Multiple
  - `Avatar.tsx` lines 96-101, 133-142 — avatar images have no `accessibilityLabel`
  - `ImageCarousel.tsx` line 56-62 — carousel images have no labels
  - `ImageLightbox.tsx` line 243-246 — gallery images have no labels
  - `ImageGallery.tsx` line 296-300 — gallery images have no labels
  - `MiniPlayer.tsx` lines 223-227 — thumbnail image has no label
  - `LinkPreview.tsx` lines 125-128 — preview image has no label
- **Impact:** Screen readers cannot describe any images to users. This is the most impactful accessibility gap — images are central to a social media app.
- **Fix:** Add `accessibilityLabel` to all Image components. For user-generated content, fall back to "Photo by [username]" or "Image [n] of [total]".

### A5-02 [SEVERITY: MEDIUM] Post images across all screens missing alt text
- **Files:** All screen files rendering `<Image>` from user content
- **Description:** The `<Image>` component from expo-image does support `accessibilityLabel` but it's never used in any screen file for user-uploaded content.
- **Fix:** Backend should support alt text fields; mobile should render them.

### A5-03 [SEVERITY: LOW] Decorative images not marked as such
- **Files:** Various gradient overlays, glow effects
- **Description:** Decorative LinearGradient and background elements don't use `importantForAccessibility="no"` or `accessibilityElementsHidden`.
- **Fix:** Add `importantForAccessibility="no"` to decorative elements.

### A5-04 [SEVERITY: LOW] SVG icons in VerifiedBadge, CharCountRing lack role="image"
- **Files:** `VerifiedBadge.tsx`, `CharCountRing.tsx`
- **Description:** SVG elements rendered by react-native-svg have no accessibility role or label.
- **Fix:** Wrap SVGs in `<View accessibilityRole="image" accessibilityLabel="...">`.

---

## CATEGORY 6: Custom Gestures Without Accessible Alternatives (5 findings)

### A6-01 [SEVERITY: HIGH] DoubleTapHeart — no accessible alternative
- **File:** `apps/mobile/src/components/ui/DoubleTapHeart.tsx`, lines 76-81
- **Description:** Double-tap to like is a custom gesture. There is no accessible alternative for users who cannot perform double-tap gestures (motor disabilities, switch control users). The gesture handler has no `accessibilityAction`.
- **Fix:** Add `accessibilityActions={[{ name: 'activate', label: 'Like' }]}` and `onAccessibilityAction` handler.

### A6-02 [SEVERITY: HIGH] ImageLightbox/ImageGallery pinch-to-zoom — no accessible alternative
- **Files:** `ImageLightbox.tsx` lines 116-131, `ImageGallery.tsx` lines 103-120
- **Description:** Pinch-to-zoom is the only way to zoom images. No button-based zoom control exists. Switch control and VoiceOver users cannot zoom.
- **Fix:** Add zoom in/out buttons that are visible when VoiceOver is active.

### A6-03 [SEVERITY: HIGH] BottomSheet swipe-to-dismiss — no button alternative
- **File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, lines 68-82
- **Description:** The primary dismiss mechanism is a swipe gesture. While there is a backdrop press to close (line 102-107), the sheet itself relies on pan gesture. The backdrop close button label uses `t()` which is undefined (see A2-11).
- **Fix:** Fix the `t()` crash and consider adding a visible close button at the top of the sheet.

### A6-04 [SEVERITY: MEDIUM] MiniPlayer swipe-to-dismiss — no close button alternative well-advertised
- **File:** `apps/mobile/src/components/ui/MiniPlayer.tsx`, lines 118-146
- **Description:** Pan gesture to dismiss (swipe down or left/right) and tap to expand are custom gestures. The close button exists (line 264-271) but is small and uses gesture composition that may confuse VoiceOver.
- **Impact:** Lower severity since a close button does exist.

### A6-05 [SEVERITY: MEDIUM] VideoPlayer seek bar — Pressable but not accessible slider
- **Files:** `VideoPlayer.tsx` lines 306-331, `VideoControls.tsx` lines 264-281
- **Description:** Seek bar is implemented as a `<Pressable>` covering the track area. It has `accessibilityRole="button"` but should be `accessibilityRole="adjustable"` with increment/decrement actions. Users cannot fine-tune position via VoiceOver gestures.
- **Fix:** Use `accessibilityRole="adjustable"` and implement `accessibilityActions` for seek forward/backward.

---

## CATEGORY 7: Screen Reader Navigation Order Issues (3 findings)

### A7-01 [SEVERITY: MEDIUM] BottomSheet content renders below backdrop in z-order
- **File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, lines 94-124
- **Description:** The backdrop Pressable is rendered before the sheet content. While visual z-order is correct (sheet overlaps backdrop), screen reader focus order may traverse the backdrop before reaching sheet items. No `accessibilityViewIsModal` is set.
- **Fix:** Add `accessibilityViewIsModal={true}` to the sheet content container (line 111) to trap VoiceOver focus inside the sheet.

### A7-02 [SEVERITY: MEDIUM] ImageLightbox/ImageGallery lacks focus trap
- **Files:** `ImageLightbox.tsx`, `ImageGallery.tsx`
- **Description:** Full-screen overlay components don't trap screen reader focus. VoiceOver users can swipe past the lightbox to elements behind it.
- **Fix:** Add `accessibilityViewIsModal={true}` to the root container.

### A7-03 [SEVERITY: LOW] Tab screen headers — focus order inconsistency
- **Files:** `saf.tsx`, `risalah.tsx`, `majlis.tsx`
- **Description:** On RTL layouts, the header row direction is reversed via `rtlFlexRow(isRTL)` but accessibility focus order may not follow the visual order. VoiceOver traverses elements in DOM order, not visual order.
- **Fix:** Consider using `accessibilityOrder` or restructuring DOM to match visual order in RTL.

---

## CATEGORY 8: Focus Management on Modals/Sheets (2 findings)

### A8-01 [SEVERITY: HIGH] BottomSheet — no focus move on open
- **File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, lines 60-65
- **Description:** When BottomSheet opens, VoiceOver focus remains on the element that triggered it. User must manually swipe to find the sheet content. No `AccessibilityInfo.announceForAccessibility()` or focus transfer occurs.
- **Fix:** On open, call `AccessibilityInfo.announceForAccessibility('Menu opened')` and set focus to the first item using `ref.current?.focus()` or `findNodeHandle`.

### A8-02 [SEVERITY: MEDIUM] Autocomplete — focus doesn't move to results
- **File:** `apps/mobile/src/components/ui/Autocomplete.tsx`
- **Description:** When autocomplete results appear, VoiceOver focus stays in the TextInput. Users don't know results are available.
- **Fix:** Announce result count with `AccessibilityInfo.announceForAccessibility()`.

---

## CATEGORY 9: Hardcoded English Accessibility Labels (2 findings)

### A9-01 [SEVERITY: MEDIUM] Multiple components use hardcoded English labels
- **Files:**
  - `GlassHeader.tsx` line 97: `accessibilityLabel: 'Go back'` (not translated)
  - `VideoControls.tsx` line 217: `accessibilityLabel={isPlaying ? 'Pause' : 'Play'}` (not translated)
  - `VideoControls.tsx` line 257: `accessibilityLabel={volume === 0 ? 'Unmute' : 'Mute'}` (not translated)
  - `MiniPlayer.tsx` line 253: `accessibilityLabel={miniPlayerPlaying ? 'Pause' : 'Play'}` (not translated)
  - `Autocomplete.tsx` line 124: `headerTitle` text "Hashtags" / "People" hardcoded
  - `Autocomplete.tsx` lines 139-141: "No hashtags found" / "No users found" hardcoded
  - `LinkPreview.tsx` line 186: `linkText: 'Open link'` hardcoded
- **Impact:** Arabic, Turkish, Urdu, Bengali, French, Indonesian, Malay users get English-only screen reader announcements.
- **Fix:** Replace all hardcoded strings with `t()` calls from useTranslation.

### A9-02 [SEVERITY: LOW] ScreenErrorBoundary uses `t()` in class component
- **File:** `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx`, line 46
- **Description:** Class component calls `t('common.error')` but `t` is not defined — `useTranslation` is a hook that cannot be used in class components. This will crash at runtime when an error boundary triggers, making the error state inaccessible.
- **Code:**
  ```tsx
  title={t('common.error')}
  ```
- **Fix:** Use a hardcoded string or wrap the error UI in a functional component that can use `useTranslation`.

---

## Summary Statistics

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| Color contrast | 5 | 0 | 2 | 2 | 1 |
| Missing labels | 15 | 0 | 6 | 8 | 1 |
| Touch targets | 8 | 0 | 4 | 3 | 1 |
| Reduced motion | 3 | 0 | 1 | 2 | 0 |
| Image alt text | 4 | 0 | 1 | 1 | 2 |
| Gesture alternatives | 5 | 0 | 3 | 2 | 0 |
| Navigation order | 3 | 0 | 0 | 2 | 1 |
| Focus management | 2 | 0 | 1 | 1 | 0 |
| Hardcoded labels | 2 | 0 | 0 | 1 | 1 |
| **Total** | **47** | **0** | **18** | **22** | **7** |

### Coverage Estimate

- **Screens with ANY accessibilityLabel:** ~141 of 172 screen files have at least one label
- **Total Pressable elements in screens:** ~1,734
- **Total accessibilityLabel occurrences in screens:** ~517
- **Coverage rate:** ~30% of interactive elements have labels (70% missing)
- **Total accessibilityRole in screens:** ~519 (many are redundant with labels)
- **useReducedMotion usage:** 0 files (hook defined but never imported)

### Top 5 Priority Fixes

1. **Import and use useReducedMotion** in Skeleton, FadeIn, DoubleTapHeart, FloatingHearts, Badge, BottomSheet — affects all users with vestibular disorders
2. **Fix BottomSheet `t()` crash** — the component will throw at runtime when backdrop close is tapped
3. **Add accessibilityLabel to all Image components** — images are the core content of a social media platform
4. **Increase touch targets** for ImageLightbox/ImageCarousel dots (8x8pt) and Bakra follow button (26x26pt)
5. **Lighten `colors.text.tertiary` to #8B949E** — single change fixes contrast across hundreds of text elements
