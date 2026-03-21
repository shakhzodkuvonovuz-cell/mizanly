# Agent #24 — UI Components Deep Audit

**Scope:** All files in `apps/mobile/src/components/ui/` (35 files), `apps/mobile/src/components/islamic/` (1 file), and `apps/mobile/src/components/` (9 root-level files + 5 subdirectories with 11 files)

**Total findings: 52**
- P0 (Ship Blocker): 6
- P1 (Critical): 10
- P2 (Major): 14
- P3 (Minor): 22

---

## P0 — Ship Blockers (6)

### P0-1: ScreenErrorBoundary crashes on error — `t()` undefined in class component
**File:** `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx`, line 46
**Category:** Runtime crash
**Description:** `ScreenErrorBoundary` is a class component that imports `useTranslation` (a hook) but never calls it. Hooks cannot be used in class components. On line 46, `t('common.error')` references an undefined `t` — when the error boundary catches an error and renders the fallback, it throws a `ReferenceError: t is not defined`, which crashes the error boundary itself. Since this is the top-level error boundary wrapping all 196 screens, an error that triggers the boundary will cause a cascading crash with no recovery.
```tsx
// Line 2: imports hook (cannot be used in class component)
import { useTranslation } from '@/hooks/useTranslation';
// Line 46: t is never defined — ReferenceError at runtime
title={t('common.error')}
```
**Fix:** Either convert to a functional wrapper that passes `t` as a prop, or use `i18next.t()` directly from the i18next instance (no hook needed).

### P0-2: BottomSheet uses `t()` without calling `useTranslation()` — crash on render
**File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, line 105
**Category:** Runtime crash
**Description:** The component imports `useTranslation` on line 2 but never calls it within the `BottomSheet` function body. On line 105, `t('common.close')` references an undefined `t`. Every BottomSheet that renders will crash with `ReferenceError: t is not defined`. BottomSheet is used on virtually every screen in the app.
```tsx
// Line 2: import { useTranslation } from '@/hooks/useTranslation';
// Line 27: function body never calls useTranslation()
// Line 105: accessibilityLabel={t('common.close')}  ← t is undefined
```
**Fix:** Add `const { t } = useTranslation();` inside the `BottomSheet` function body.

### P0-3: VideoPlayer uses `t()` without calling `useTranslation()` — crash on render
**File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`, lines 270, 375
**Category:** Runtime crash
**Description:** Same pattern as BottomSheet. Imports `useTranslation` on line 2, never calls it. Uses `t('minbar.pictureInPicture')` on line 270 and `t('minbar.all')` on line 375. Additionally, line 7 has a bare comma (`,`) in the import list and line 10 has duplicate `Pressable` import — these are syntax errors.
```tsx
// Line 7:  ,                    ← bare comma, syntax error
// Line 10: Pressable,           ← duplicate import (already on line 8)
// Line 270: accessibilityLabel={t('minbar.pictureInPicture')}  ← t undefined
```

### P0-4: VideoControls uses `t()` without calling `useTranslation()` — crash on render
**File:** `apps/mobile/src/components/ui/VideoControls.tsx`, lines 185, 195, 209, 217, 225
**Category:** Runtime crash
**Description:** Imports `useTranslation` on line 2, never calls it. Uses `t()` in 5 locations for accessibility labels. Also has bare comma on line 7 and duplicate Pressable import on line 11.

### P0-5: MiniPlayer uses `t()` without calling `useTranslation()` — crash on render
**File:** `apps/mobile/src/components/ui/MiniPlayer.tsx`, line 267
**Category:** Runtime crash
**Description:** Imports `useTranslation` on line 2, never calls it. Uses `t('common.close')` on line 267. Also has bare comma on line 7.

### P0-6: LocationPicker uses `t()` without calling `useTranslation()` — crash on render
**File:** `apps/mobile/src/components/ui/LocationPicker.tsx`, line 119
**Category:** Runtime crash
**Description:** Imports `useTranslation` on line 2, never calls it. Uses `t('common.searchLocations')` on line 119 for the placeholder.

---

## P1 — Critical (10)

### P1-1: ThreadCard uses `t()` without calling `useTranslation()` — crash on menu open
**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`, lines 230, 317, 350, 372, 377, 388, 396, 401
**Category:** Runtime crash
**Description:** Imports `useTranslation` on line 2, never invokes the hook. Uses `t()` in 8+ locations (accessibility labels, menu item labels). All thread cards will crash when the more-options menu is opened.

### P1-2: CommentsSheet uses `t()` without calling `useTranslation()` — crash on empty state
**File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`, lines 170, 171, 230
**Category:** Runtime crash
**Description:** Same pattern. Imports `useTranslation` on line 2, never calls it. Uses `t()` for empty state text and input placeholder. Crash occurs when the comments sheet opens and either shows empty state or the text input.

### P1-3: AlgorithmCard has corrupted imports — `memo` duplicated across all imports
**File:** `apps/mobile/src/components/AlgorithmCard.tsx`, lines 1-6
**Category:** Syntax error / build failure
**Description:** Every import line starts with `memo,` as a named import from the wrong module:
```tsx
import { memo, useState, useCallback } from 'react';
import { memo, View, Text, Pressable, StyleSheet } from 'react-native';   // memo is not in react-native
import { memo, Icon } from '@/components/ui/Icon';                         // memo is not exported from Icon
import { memo, colors, spacing, fontSize, radius, fonts } from '@/theme'; // memo is not in theme
import { memo, useTranslation } from '@/hooks/useTranslation';            // memo is not in useTranslation
```
This will fail at build time with import errors. If somehow it builds (e.g., tree-shaking ignores unused imports), the duplicate `memo` bindings will shadow each other unpredictably.

### P1-4: StoryRow has corrupted imports — `memo` duplicated across all imports
**File:** `apps/mobile/src/components/saf/StoryRow.tsx`, lines 1-4
**Category:** Syntax error / build failure
**Description:** Same corruption pattern as AlgorithmCard:
```tsx
import { memo, FlatList, View, StyleSheet } from 'react-native';  // OK (memo re-exported from RN? No, it's not)
import { memo, useUser } from '@clerk/clerk-expo';                  // memo is not in clerk
import { memo, StoryBubble } from './StoryBubble';                 // memo is not exported from StoryBubble
import { memo, colors, spacing } from '@/theme';                   // memo is not in theme
```

### P1-5: ToastNotification built but never imported or used anywhere
**File:** `apps/mobile/src/components/ui/ToastNotification.tsx`
**Category:** Dead code / missing feature
**Description:** A fully functional toast notification component (156 lines) exists with animations, blur, and auto-dismiss, but grep confirms it is imported in exactly 0 files. No screen or layout uses it. All "toast" feedback in the app (copy, save, etc.) is handled via `Alert.alert()` or haptic-only feedback, losing visual confirmation for the user.

### P1-6: Wrong font family names in 4 style locations
**Files:**
- `apps/mobile/src/components/ui/ImageCarousel.tsx`, line 161: `'DMSans-Medium'`
- `apps/mobile/src/components/ui/ImageGallery.tsx`, line 375: `'DMSans-Medium'`
- `apps/mobile/src/components/ui/VideoControls.tsx`, line 354: `'DMSans-Medium'`
- `apps/mobile/src/components/ui/VideoControls.tsx`, line 373: `'DMSans-Medium'`
**Category:** Visual bug
**Description:** Per CLAUDE.md, the correct registered font name is `'DMSans_500Medium'` (underscore, not hyphen). Using `'DMSans-Medium'` silently falls back to system font, causing inconsistent typography. The convention is documented in the font family section of CLAUDE.md.

### P1-7: LinkPreview uses hardcoded mock data instead of real URL metadata
**File:** `apps/mobile/src/components/ui/LinkPreview.tsx`, lines 34-61
**Category:** Stub / non-functional
**Description:** The `generateMockMetadata()` function returns random fake titles and random Picsum images for every URL. It never fetches actual OG metadata. This means every link preview shows fabricated content — completely misleading the user about what the link contains. The comments say "in production this would fetch from backend" but no real implementation exists.

### P1-8: Bare comma syntax errors in 6 component import lists
**Files:**
- `apps/mobile/src/components/ui/VideoPlayer.tsx`, line 7
- `apps/mobile/src/components/ui/VideoControls.tsx`, line 7
- `apps/mobile/src/components/ui/MiniPlayer.tsx`, line 7
- `apps/mobile/src/components/ui/LinkPreview.tsx`, line 6
- `apps/mobile/src/components/risalah/StickerPackBrowser.tsx`, line 7
- `apps/mobile/src/components/risalah/StickerPicker.tsx`, line 7
**Category:** Syntax error
**Description:** These files have a lone `,` on a line in their React Native import destructuring, which is a syntax error. TypeScript may or may not tolerate this depending on parser settings, but it indicates corrupted imports.

### P1-9: Duplicate `Pressable` imports in VideoPlayer and VideoControls
**Files:**
- `apps/mobile/src/components/ui/VideoPlayer.tsx`, lines 8 and 10
- `apps/mobile/src/components/ui/VideoControls.tsx`, lines 8 and 11
**Category:** Syntax error
**Description:** `Pressable` is imported twice from `react-native` in the same destructuring. This is a syntax error in strict mode and indicates corrupted auto-generation.

### P1-10: ErrorBoundary (root) uses hardcoded English strings
**File:** `apps/mobile/src/components/ErrorBoundary.tsx`, lines 37-41
**Category:** i18n violation
**Description:** The root `ErrorBoundary` (distinct from `ScreenErrorBoundary`) uses hardcoded English: `"Something went wrong"`, `"An unexpected error occurred."`, `"Try again"`. This is a class component so hooks can't be used, but `i18next.t()` could be called directly.

---

## P2 — Major (14)

### P2-1: BottomSheet has no keyboard avoidance
**File:** `apps/mobile/src/components/ui/BottomSheet.tsx`
**Category:** UX bug
**Description:** When a BottomSheet contains a `TextInput` (e.g., LocationPicker, search sheets), the keyboard will cover the input content. There is no `KeyboardAvoidingView` or `keyboardVerticalOffset` handling. On iOS, the sheet content will be hidden behind the keyboard.

### P2-2: ImageCarousel FlatList missing `RefreshControl` (violates project rule)
**File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, line 91
**Category:** Rule violation
**Description:** Per CLAUDE.md rule 7: "ALL FlatLists must have `<RefreshControl>`". The horizontal FlatList in ImageCarousel has no `onRefresh` or `refreshing` prop. While pull-to-refresh on horizontal lists is uncommon, this technically violates the stated rule.

### P2-3: Autocomplete has 6 hardcoded English strings
**File:** `apps/mobile/src/components/ui/Autocomplete.tsx`, lines 101, 124, 139-153
**Category:** i18n violation
**Description:** Hardcoded strings: `"posts"` (line 101), `"Hashtags"` / `"People"` (line 124), `"No hashtags found for..."` / `"No users found for..."` (lines 139-141), `"Create #..."` (line 153). The component does not import or use `useTranslation` at all.

### P2-4: LocationPicker has 6 hardcoded English strings
**File:** `apps/mobile/src/components/ui/LocationPicker.tsx`, lines 112, 142, 146, 160, 177, 93-106
**Category:** i18n violation
**Description:** Hardcoded strings: `"Add Location"`, `"Use Current Location"`, `"Recent"`, `"Search Results"` / `"Popular Locations"`, `"No locations found"`, `"Current Location"` / `"This would request device location..."`.

### P2-5: LocationPicker uses mock data with Alert.alert() instead of real location API
**File:** `apps/mobile/src/components/ui/LocationPicker.tsx`, lines 28-39, 92-107
**Category:** Stub / non-functional
**Description:** `handleCurrentLocation` shows an `Alert.alert()` saying "This would request device location permissions..." instead of actually requesting `expo-location` permissions. The search is just a filter over 10 hardcoded mosque locations. No Google Places or any real geocoding API is integrated.

### P2-6: VideoPlayer `Audio` import is unused
**File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`, line 13
**Category:** Dead code
**Description:** `Audio` is imported from `expo-av` but never used anywhere in the component.

### P2-7: EmptyState `size` prop is accepted but unused
**File:** `apps/mobile/src/components/ui/EmptyState.tsx`, line 16
**Category:** API inconsistency
**Description:** The `EmptyStateProps` interface includes `size?: 'sm' | 'md' | 'lg'` but the component function signature destructures it and then never uses it: `function EmptyState({ icon, title, subtitle, actionLabel, onAction, style }: EmptyStateProps)` — `size` is in the type but not destructured, so it's silently ignored.

### P2-8: Icon component does not warn on unknown icon names — silently returns null
**File:** `apps/mobile/src/components/ui/Icon.tsx`, line 149
**Category:** Silent failure
**Description:** If an invalid icon name is passed (e.g., a typo), `iconMap[name]` returns `undefined` and the component returns `null` — no warning, no visible error. This makes typos in icon names very hard to debug since the icon silently disappears.

### P2-9: BottomSheet hardcodes iOS bottom padding
**File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, line 183
**Category:** UX bug
**Description:** `paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg` hardcodes 34pt for iOS. This should use `useSafeAreaInsets().bottom` to correctly handle devices with varying home indicator heights. On older iOS devices without a home indicator, this adds unnecessary padding.

### P2-10: FadeIn `delay` prop is accepted but never used
**File:** `apps/mobile/src/components/ui/FadeIn.tsx`, line 12
**Category:** API inconsistency
**Description:** The `FadeInProps` interface accepts a `delay` prop, but the `withTiming` call on line 28 doesn't use it. The delay parameter is completely ignored.

### P2-11: FloatingHearts `Heart` component has empty useEffect dependency array
**File:** `apps/mobile/src/components/ui/FloatingHearts.tsx`, line 68
**Category:** React warning
**Description:** The `Heart` sub-component's `useEffect` has `[]` as dependencies, but uses `particle`, `scale`, `rotate`, `translateY`, `opacity`, and `onComplete` from closure. While this is intentional (fire-once on mount), ESLint's exhaustive-deps rule would flag it, and the pattern is brittle.

### P2-12: GlassHeader `accessibilityLabel` defaults to `'Go back'` hardcoded English
**File:** `apps/mobile/src/components/ui/GlassHeader.tsx`, line 97
**Category:** i18n violation
**Description:** `accessibilityLabel: 'Go back'` is hardcoded instead of using a translation key. This affects screen reader users in non-English locales.

### P2-13: MiniPlayer `positionMillis` calculation is wrong
**File:** `apps/mobile/src/components/ui/MiniPlayer.tsx`, line 283
**Category:** Logic bug
**Description:** `positionMillis: miniPlayerProgress > 0 ? Math.round(miniPlayerProgress * 1000 * 60) : undefined` multiplies by `1000 * 60 = 60000`. But `miniPlayerProgress` is a ratio (0-1) computed from `positionMillis / durationMillis`. To convert back to millis, you'd need to multiply by the actual duration in ms, not by a fixed 60 seconds. This means the mini player always seeks to a position assuming the video is exactly 60 seconds long.

### P2-14: BottomSheet `snapPoint` prop accepts percentage but is used as pixel height
**File:** `apps/mobile/src/components/ui/BottomSheet.tsx`, lines 23, 42
**Category:** API confusion
**Description:** The interface says `snapPoint?: number; // percentage of screen height (0-1)` and line 42 does `const maxHeight = snapPoint ? SCREEN_HEIGHT * snapPoint : undefined`. However, callers like `AuthGate` pass `snapPoint={320}` (line 49 of AuthGate.tsx), which would compute `maxHeight = SCREEN_HEIGHT * 320` — a massive value. The API documentation says 0-1 percentage but callers pass pixel values.

---

## P3 — Minor (22)

### P3-1: ScreenErrorBoundary hardcodes English fallback strings
**File:** `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx`, lines 47-48
**Strings:** `"An unexpected error occurred. Please try again."`, `"Try again"`

### P3-2: VideoPlayer speed labels hardcoded in English
**File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`, lines 341-369
**Strings:** `"0.25x"`, `"0.5x"`, `"1x (Normal)"`, `"1.25x"`, `"1.5x"`, `"2x"`, `"Auto"`

### P3-3: VideoControls speed/quality labels hardcoded in English
**File:** `apps/mobile/src/components/ui/VideoControls.tsx`, lines 217, 257-258
**Strings:** `"Pause"`, `"Play"`, `"Unmute"`, `"Mute"`, `"(Normal)"`

### P3-4: MiniPlayer accessibility labels hardcoded in English
**File:** `apps/mobile/src/components/ui/MiniPlayer.tsx`, lines 253
**Strings:** `"Pause"`, `"Play"`

### P3-5: GlassHeader badge renders `'action'` as fallback accessibility label
**File:** `apps/mobile/src/components/ui/GlassHeader.tsx`, line 58
**Description:** When `accessibilityLabel` is not provided and `icon` is a React node (not string), the fallback is the unhelpful string `'action'`.

### P3-6: Avatar fallback character shows '?' for undefined name
**File:** `apps/mobile/src/components/ui/Avatar.tsx`, lines 105, 147
**Description:** `name?.[0]?.toUpperCase() ?? '?'` — the `?` character is shown when no name is provided. Consider showing a user icon instead.

### P3-7: Avatar non-pressable variant lacks `accessibilityLabel`
**File:** `apps/mobile/src/components/ui/Avatar.tsx`, line 188
**Description:** When `onPress` is not provided, the Avatar renders as a plain `<View>` without `accessibilityLabel`. The pressable variant correctly includes it (line 180).

### P3-8: Skeleton components lack `accessibilityLabel` for screen readers
**File:** `apps/mobile/src/components/ui/Skeleton.tsx`
**Description:** None of the Skeleton variants (PostCard, ThreadCard, ConversationItem, ProfileHeader) have `accessibilityLabel` to announce "Loading..." to screen reader users.

### P3-9: CharCountRing uses magic number for `SHOW_AT` threshold
**File:** `apps/mobile/src/components/ui/CharCountRing.tsx`, line 13
**Description:** `const SHOW_AT = 0.7` is documented in CLAUDE.md as "hidden <70%" but there's no i18n or accessibility announcement when the ring appears.

### P3-10: DoubleTapHeart missing accessibilityLabel
**File:** `apps/mobile/src/components/ui/DoubleTapHeart.tsx`, line 111
**Description:** The GestureDetector wrapper has no accessibility label announcing "Double tap to like".

### P3-11: ImageCarousel `onScroll` is not throttled via `scrollEventThrottle`
**File:** `apps/mobile/src/components/ui/ImageCarousel.tsx`, line 101
**Description:** Actually it does set `scrollEventThrottle={16}` — this is fine. However, `setCurrentIndex` is called on every scroll event without checking if the index actually changed (the check is there on line 42-43, disregard this finding). [RETRACTED]

### P3-12: TabBarIndicator initial position doesn't account for indicator centering
**File:** `apps/mobile/src/components/ui/TabBarIndicator.tsx`, line 47
**Description:** The indicator width is `indicatorWidth * 0.4` (40% of tab width) but the translateX positions it at the start of the tab, not centered. The indicator will appear left-aligned within each tab rather than centered.

### P3-13: TabSelector creates new function per render in `handleTabLayout`
**File:** `apps/mobile/src/components/ui/TabSelector.tsx`, line 30
**Description:** `handleTabLayout` uses `useCallback` but returns a new function per `index` parameter. This means each tab's `onLayout` gets a new function reference on every render when `activeIndex` changes, which is correct behavior but could be memoized more aggressively.

### P3-14: TTSMiniPlayer uses 'volume-x' icon instead of 'volume-2' for speaker
**File:** `apps/mobile/src/components/ui/TTSMiniPlayer.tsx`, line 60
**Description:** The speaker icon for the TTS player uses `volume-x` (muted/off icon) instead of `volume-2` (speaker with sound waves). This visually suggests the audio is muted when it's actually playing.

### P3-15: EidFrame greeting text is hardcoded, not translatable
**File:** `apps/mobile/src/components/islamic/EidFrame.tsx`, lines 13-19
**Description:** The `OCCASION_CONFIG` has hardcoded English greetings (`'Eid Mubarak'`, `'Ramadan Kareem'`, etc.) alongside Arabic. For the 6 other non-English/non-Arabic languages (Turkish, Urdu, Bengali, French, Indonesian, Malay), the English greeting is shown instead of the localized version.

### P3-16: ImageGallery and ImageLightbox are near-identical duplicates
**Files:** `apps/mobile/src/components/ui/ImageGallery.tsx` (394 lines), `apps/mobile/src/components/ui/ImageLightbox.tsx` (346 lines)
**Description:** These two components have ~90% identical code (pinch-to-zoom, swipe-to-dismiss, page indicators, share functionality). ImageGallery adds an entrance animation and a slightly different button layout. This is code duplication that should be consolidated.

### P3-17: ImageGallery uses deprecated `Extrapolate` instead of `Extrapolation`
**File:** `apps/mobile/src/components/ui/ImageGallery.tsx`, line 22
**Description:** `Extrapolate` is imported from reanimated but the current API uses `Extrapolation`. This may produce a deprecation warning.

### P3-18: WebSafeBlurView fallback ignores `intensity` on web
**File:** `apps/mobile/src/components/ui/WebSafeBlurView.tsx`, line 38
**Description:** On web, the `intensity` prop is completely ignored — the fallback always uses the same opacity from `TINT_COLORS`. Higher intensity values should map to more opaque backgrounds.

### P3-19: PremiereCountdown time labels use single-character abbreviations
**File:** `apps/mobile/src/components/ui/PremiereCountdown.tsx`, lines 92, 97, 103, 108
**Description:** Time unit labels are hardcoded as `"d"`, `"h"`, `"m"`, `"s"` instead of using i18n keys.

### P3-20: RichText phone number regex is overly broad
**File:** `apps/mobile/src/components/ui/RichText.tsx`, line 20
**Description:** The phone regex `\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}` can match sequences of digits that aren't phone numbers (e.g., "in 2025-03-21 at 10:30" would match parts as phone numbers). This can cause unexpected phone links in post content.

### P3-21: Autocomplete FlatList missing RefreshControl
**File:** `apps/mobile/src/components/ui/Autocomplete.tsx`, line 159
**Category:** Rule violation (minor for dropdown)
**Description:** FlatList without onRefresh/refreshing, violating rule 7. Less impactful since this is a small dropdown.

### P3-22: EidFrame exports both named and default export
**File:** `apps/mobile/src/components/islamic/EidFrame.tsx`, lines 22 and 115
**Description:** `export function EidFrame` (named) and `export default EidFrame` (default) both exist. This can cause confusion about which import style to use and potential bundle duplication.

---

## Summary Table

| Severity | Count | Theme |
|----------|-------|-------|
| P0 | 6 | `t()` undefined in 5 components (ScreenErrorBoundary class + 4 function components that import but never call `useTranslation()`), LocationPicker also crashes |
| P1 | 10 | 2 more `t()` crashes (ThreadCard, CommentsSheet), 2 corrupted import files (AlgorithmCard, StoryRow), ToastNotification unused, wrong font names, mock data stubs, syntax errors |
| P2 | 14 | No keyboard avoidance in BottomSheet, 12+ hardcoded English strings, wrong mini player position calc, snapPoint API mismatch |
| P3 | 22 | Missing accessibility labels, code duplication, dead props, minor i18n gaps |

### Critical Pattern: `useTranslation` imported but never invoked

**8 components** share this exact bug pattern:
1. `BottomSheet.tsx` — used on every screen
2. `VideoPlayer.tsx` — used on all video screens
3. `VideoControls.tsx` — used on long-form video screens
4. `MiniPlayer.tsx` — persistent mini player
5. `LocationPicker.tsx` — create post location
6. `ThreadCard.tsx` — every thread in Majlis
7. `CommentsSheet.tsx` — every reel's comments
8. `ScreenErrorBoundary.tsx` — wraps all 196 screens (class component, cannot use hooks at all)

These files all have `import { useTranslation } from '@/hooks/useTranslation'` at the top but the hook is never called with `const { t } = useTranslation()`. The `t()` function is referenced but undefined, causing `ReferenceError` at the point the `t()` call is evaluated during render.

**Impact:** Since BottomSheet and ScreenErrorBoundary are foundational components used across the entire app, this pattern guarantees crashes on virtually every screen interaction.

### Files Audited (56 total)

**ui/ (35 files):** ActionButton, AuthGate, Autocomplete, Avatar, Badge, BottomSheet, CaughtUpCard (part of theme), CharCountRing, DoubleTapHeart, EmptyState, EndScreenOverlay, FadeIn, FloatingHearts, GlassHeader, GradientButton, Icon, ImageCarousel, ImageGallery, ImageLightbox, LinkPreview, LocationPicker, MiniPlayer, OfflineBanner, PremiereCountdown, RichText, ScreenErrorBoundary, Skeleton, TTSMiniPlayer, TabBarIndicator, TabSelector, ToastNotification, VerifiedBadge, VideoControls, VideoPlayer, WebSafeBlurView

**islamic/ (1 file):** EidFrame

**Root components (9 files):** AlgorithmCard, ContactMessage, ErrorBoundary, GiftOverlay, LocationMessage, PinnedMessageBar, ReminderButton, VideoReplySheet, ViewOnceMedia

**Subdirectory components (11 files):** bakra/CommentsSheet, editor/VideoTimeline + VideoTransitions, majlis/ThreadCard, risalah/StickerPackBrowser + StickerPicker, saf/PostCard + PostMedia + StoryBubble + StoryRow, story/* (11 files)
