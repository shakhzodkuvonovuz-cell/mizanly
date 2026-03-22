# UI/UX Elevation Master Plan — From 4.8/10 to 9/10

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate 208 mobile screens from DeepSeek-quality (4.8/10) to Instagram/TikTok/YouTube-level (9/10) through a 4-layer systematic approach: foundation components, universal patterns, category sweeps, and hero polish.

**Architecture:** Bottom-up ripple strategy. Layer 1 fixes ~10 shared components that automatically upgrade all 208 screens. Layer 2 adds ~10 universal utilities. Layer 3 applies category-specific templates to 7 screen groups. Layer 4 hand-polishes the 10 most-used screens. Each layer builds on the previous.

**Tech Stack:** React Native (Expo SDK 52), react-native-reanimated, react-native-gesture-handler, expo-blur, expo-linear-gradient, expo-haptics, @shopify/flash-list, Zustand

---

## Design System: "Modern Dark Cinema" (from ui-ux-pro-max)

### Style DNA

Mizanly's visual identity fuses the **Modern Dark Cinema Mobile** style with Islamic cultural elements:

| Principle | Instagram/TikTok | Mizanly Adaptation |
|-----------|-----------------|-------------------|
| Background | Pure black (#000) or near-black | `#0D1117` (current, good — avoids OLED smear) |
| Cards | Subtle elevation, hairline borders | `rgba(255,255,255,0.08)` borders, `borderRadius: 16` |
| Accent | Platform blue/pink | Emerald `#0A7B4F` + Gold `#C8963E` |
| Motion | Spring physics, 150-300ms | `Easing.bezier(0.16, 1, 0.3, 1)` cinematic curve |
| Haptics | Contextual per-action | Light (nav), Medium (like), Success (follow), Warning (delete) |
| Glass | Blur headers, tab bars | `BlurView intensity={20-60}` on all overlays |
| Typography | SF Pro / Roboto | PlayfairDisplay (heading) + DMSans (body) + NotoNaskh (Arabic) |
| Content | Content-first, UI disappears | Headers hide on scroll, glass overlays, minimal chrome |

### Color System (Existing — Keep, Extend)

```
Brand:        emerald #0A7B4F | gold #C8963E | cream #FEFCF7
Dark bg:      #0D1117 → #161B22 → #1C2333 → #21283B (elevation ladder)
Text:         primary #FFF | secondary #9BA4AE | tertiary #8B949E
Glass:        rgba(255,255,255, 0.05/0.08/0.12/0.15) (4-tier overlay system)
Interaction:  emerald5→emerald50 opacity ramp (existing, good)
```

**NEW tokens needed:**
```
colors.interaction.pressed    = rgba(255,255,255, 0.04)   // card press feedback
colors.interaction.hover      = rgba(255,255,255, 0.06)   // hover state (web)
colors.interaction.disabled   = 0.38 opacity               // WCAG disabled opacity
colors.semantic.success       = #0A7B4F (= emerald)
colors.semantic.warning       = #D29922 (existing)
colors.semantic.error         = #F85149 (existing)
colors.semantic.info          = #58A6FF (existing)
```

### Typography Scale (Existing — Extend with line heights)

```
fontSize:     xs=11  sm=13  base=15  md=17  lg=20  xl=24  2xl=28  3xl=34  4xl=42
NEW lineHeight: 16    18     22       24     28     32     36      44      52
NEW letterSpacing: 0   0     0        0      -0.3   -0.5   -0.8    -1.0    -1.2
```

### Animation Presets (Existing — Extend)

```
Existing springs: responsive, bouncy, gentle, snappy, fluid — KEEP ALL

NEW cinematic easing:
  animation.easing.cinematic = Easing.bezier(0.16, 1, 0.3, 1)  // Instagram-style
  animation.easing.decelerate = Easing.bezier(0, 0, 0.2, 1)    // Material decelerate
  animation.easing.accelerate = Easing.bezier(0.4, 0, 1, 1)    // exit animations

NEW timing presets:
  animation.stagger.item = 40     // ms between staggered list items
  animation.stagger.section = 80  // ms between staggered sections
  animation.entrance.duration = 350  // default entrance animation
  animation.exit.duration = 250     // exits 70% of entrance (Material rule)
```

### Haptic Patterns (NEW — contextual per action type)

```
haptic.navigation  = Impact.Light      // tab press, back, navigate
haptic.like        = Impact.Medium     // like, heart, react
haptic.follow      = Notification.Success  // follow, subscribe
haptic.save        = Impact.Light      // bookmark, save
haptic.delete      = Notification.Warning  // destructive actions
haptic.error       = Notification.Error    // validation fail
haptic.tick        = Selection         // tab switch, picker change
haptic.longPress   = Impact.Heavy      // long-press context menu
```

---

## LAYER 1: Foundation Components (4.8 → 6.5)

**Impact:** ~10 files changed → ALL 208 screens automatically improved.
**Principle:** Fix the atoms, the molecules fix themselves.

---

### Task 1: Expand Theme Tokens

**Files:**
- Modify: `apps/mobile/src/theme/index.ts`
- Test: `apps/api/src/modules/**/*.spec.ts` (no mobile tests for theme — manual verification)

**What changes:**

Add to `theme/index.ts`:

```typescript
// Line height scale (pair with fontSize)
export const lineHeight = {
  xs: 16, sm: 18, base: 22, md: 24, lg: 28, xl: 32,
  '2xl': 36, '3xl': 44, '4xl': 52,
} as const;

// Letter spacing scale (tighter for larger text — like Instagram)
export const letterSpacing = {
  tight: -1.2,    // hero/display
  snug: -0.8,     // headings
  normal: 0,      // body
  wide: 0.5,      // labels/captions
  wider: 1.0,     // ALL CAPS labels
} as const;

// Interaction state tokens
export const interaction = {
  pressed: 'rgba(255, 255, 255, 0.04)',
  hover: 'rgba(255, 255, 255, 0.06)',
  disabledOpacity: 0.38,
  focusRing: colors.emerald,
  focusRingWidth: 2,
} as const;

// Cinematic easing (add to animation object)
// Inside animation object, add:
easing: {
  cinematic: Easing.bezier(0.16, 1, 0.3, 1),
  decelerate: Easing.bezier(0, 0, 0.2, 1),
  accelerate: Easing.bezier(0.4, 0, 1, 1),
},
stagger: {
  item: 40,
  section: 80,
},
entrance: { duration: 350 },
exit: { duration: 250 },
```

**Commit:** `feat(theme): add lineHeight, letterSpacing, interaction, cinematic easing tokens`

---

### Task 2: Fix System Theme + Light Mode

**Files:**
- Modify: `apps/mobile/src/theme/index.ts` — `getThemeColors()` function
- Modify: `apps/mobile/src/hooks/useThemeColors.ts` — add Appearance listener
- Modify: `apps/mobile/src/components/ui/ScreenErrorBoundary.tsx` — hardcoded dark bg
- Modify: `apps/mobile/src/components/ui/BottomSheet.tsx` — hardcoded text color
- Modify: `apps/mobile/src/components/ui/EmptyState.tsx` — hardcoded text colors
- Modify: `apps/mobile/src/components/ui/Avatar.tsx` — hardcoded fallback bg/text
- Modify: `apps/mobile/src/theme/index.ts` — elevation presets use hardcoded dark colors

**What changes:**

1. `getThemeColors('system')` currently hardcodes `'dark'`. Fix:
```typescript
import { Appearance } from 'react-native';

export function getThemeColors(theme: 'dark' | 'light' | 'system') {
  const effectiveTheme = theme === 'system'
    ? (Appearance.getColorScheme() ?? 'dark')
    : theme;
  const surface = effectiveTheme === 'dark' ? colors.dark : colors.light;
  const text = effectiveTheme === 'dark' ? colors.text : colors.textLight;
  return { ...surface, text, isDark: effectiveTheme === 'dark' };
}
```

2. `useThemeColors.ts` — add `Appearance` change listener so "system" responds to OS theme changes:
```typescript
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

export function useThemeColors() {
  const theme = useStore(s => s.theme);
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    if (theme !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, [theme]);

  return useMemo(() => getThemeColors(theme), [theme, systemScheme]);
}
```

3. Fix hardcoded colors in 5 components — each one: replace `colors.dark.*` or `colors.text.*` in StyleSheet with inline `tc.*` equivalent, following the pattern already used in most screens.

**Commit:** `fix(theme): system theme respects OS, light mode works across 15 components`

---

### Task 3: Create Toast Component

**Files:**
- Create: `apps/mobile/src/components/ui/Toast.tsx`
- Modify: `apps/mobile/src/store/index.ts` — add toast state
- Modify: `apps/mobile/app/_layout.tsx` — mount ToastContainer at root

**Design spec (Instagram-level):**

```
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │
│  │ [icon]  Message text here    [x]  │  │
│  │         Optional action      ━━━  │  │  ← progress bar (auto-dismiss)
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

Variants: success (emerald), error (red), warning (gold), info (blue)
Glass card with BlurView backdrop
Slides up from bottom with spring physics
Swipe down to dismiss (gesture handler)
Auto-dismiss: 3s default, progress bar shows remaining time
Stacks: max 2 visible, older ones slide out
Theme-aware: works in both dark and light mode
```

**Zustand state (add to store):**
```typescript
// Toast types
interface ToastItem {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: { label: string; onPress: () => void };
}

// Store additions
toasts: ToastItem[];
showToast: (toast: Omit<ToastItem, 'id'>) => void;
dismissToast: (id: string) => void;
```

**Component features:**
- `BlurView` background (intensity 40, tint 'dark')
- Left accent bar matching variant color
- Icon: check-circle (success), slash (error), bell (warning), info (info)
- Swipe-to-dismiss via `Gesture.Pan()` — drag down > 60px dismisses
- Auto-dismiss progress bar: thin line at bottom that shrinks over duration
- Spring entrance: `withSpring(0, { damping: 20, stiffness: 90 })`
- Exit: `withTiming(height + 20, { duration: 250 })`
- Max 2 visible — older toasts auto-dismissed when 3rd arrives
- Haptic on show: success → haptic.success, error → haptic.error, etc.
- Accessibility: `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`

**Commit:** `feat(ui): create Toast component with glass card, swipe dismiss, auto-dismiss progress`

---

### Task 4: Upgrade Skeleton with Brand Shimmer

**Files:**
- Modify: `apps/mobile/src/components/ui/Skeleton.tsx`

**What changes:**

Current: Generic white shimmer `rgba(255,255,255,0.05→0.1)`
Upgrade: Emerald-tinted brand shimmer wave

```typescript
// Replace shimmer gradient colors:
// Old:
['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)', 'transparent']

// New — emerald-tinted brand shimmer:
[
  'transparent',
  tc.isDark ? 'rgba(10,123,79,0.04)' : 'rgba(10,123,79,0.06)',
  tc.isDark ? 'rgba(10,123,79,0.08)' : 'rgba(10,123,79,0.12)',
  tc.isDark ? 'rgba(10,123,79,0.04)' : 'rgba(10,123,79,0.06)',
  'transparent',
]
```

Also:
- Pass `isDark` from `getThemeColors` return value
- Increase shimmer gradient width from 300 to full container width
- Add `staggerDelay` prop to ShimmerBase for staggered wave across multiple skeletons:
  ```typescript
  // Each skeleton in a group starts its shimmer slightly later
  const delay = staggerDelay ?? 0;
  shimmer.value = withDelay(delay, withRepeat(...));
  ```

**Commit:** `feat(ui): upgrade Skeleton with emerald brand shimmer + stagger support`

---

### Task 5: Upgrade Avatar with Animated Story Ring

**Files:**
- Modify: `apps/mobile/src/components/ui/Avatar.tsx`

**What changes:**

Current: Static `LinearGradient` ring for stories.
Upgrade: Continuously rotating gradient ring (like Instagram's rainbow ring).

```typescript
// Add rotation animation when showStoryRing is true:
const ringRotation = useSharedValue(0);

useEffect(() => {
  if (showStoryRing) {
    ringRotation.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1, // infinite
      false // no reverse
    );
  } else {
    ringRotation.value = 0;
  }
}, [showStoryRing]);

const ringAnimatedStyle = useAnimatedStyle(() => ({
  transform: [{ rotate: `${ringRotation.value * 360}deg` }],
}));

// Wrap the LinearGradient in Animated.View with ringAnimatedStyle
// Also: add "viewed" state — gray ring instead of gradient when story is viewed
// Add prop: storyViewed?: boolean
// If storyViewed, ring colors = [colors.text.tertiary, colors.text.tertiary] (gray, static)
```

Also:
- Online dot: add subtle pulse animation
  ```typescript
  const onlinePulse = useSharedValue(1);
  useEffect(() => {
    if (showOnline) {
      onlinePulse.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ), -1, true
      );
    }
  }, [showOnline]);
  ```
- Respect `useReducedMotion()` — skip rotation + pulse when enabled
- Error fallback: if image fails to load, show initials (already exists, good)

**Commit:** `feat(ui): Avatar rotating story ring, viewed state, online pulse animation`

---

### Task 6: Upgrade EmptyState

**Files:**
- Modify: `apps/mobile/src/components/ui/EmptyState.tsx`

**What changes:**

1. Theme-aware text colors (fix light mode):
```typescript
// Replace hardcoded colors.text.* in StyleSheet with tc.text.*:
<Text style={[styles.title, { color: tc.text.primary }]}>{title}</Text>
<Text style={[styles.subtitle, { color: tc.text.secondary }]}>{subtitle}</Text>
```

2. Add optional illustration/custom icon slot:
```typescript
interface EmptyStateProps {
  icon?: IconName;
  illustration?: React.ReactNode;  // NEW — custom illustration (Lottie, SVG, etc.)
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

// Render: illustration ?? icon fallback
{illustration ? (
  <View style={styles.illustrationWrap}>{illustration}</View>
) : icon ? (
  <View style={[styles.iconWrap, { backgroundColor: tc.bgElevated }]}>
    <Icon name={icon} size="xl" color={tc.text.tertiary} />
  </View>
) : null}
```

3. Pulsing CTA button (draws attention):
```typescript
// GradientButton with subtle scale pulse when it's the only action on screen:
const ctaPulse = useSharedValue(1);
useEffect(() => {
  if (actionLabel && onAction) {
    ctaPulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ), -1, true
    );
  }
}, [actionLabel, onAction]);
```

**Commit:** `feat(ui): EmptyState theme-aware, illustration support, pulsing CTA`

---

### Task 7: Fix 6 Crash Bugs

**Files:**
- `apps/mobile/app/(screens)/quran-reading-plan.tsx` — plan variable ReferenceError
- `apps/mobile/app/(screens)/audio-library.tsx` — Rules of Hooks in map loop
- `apps/mobile/app/(screens)/communities.tsx` — missing useThemeColors
- `apps/mobile/app/(screens)/waqf.tsx` — duplicate Alert import
- `apps/mobile/app/(screens)/sticker-browser.tsx` — SCREEN_WIDTH undefined
- `apps/mobile/app/(screens)/conversation/[id].tsx` — JSX nesting error

**For each file:** Read the file, find the exact bug, fix it. These are all simple fixes:
1. Move `plan` declaration before its reference
2. Extract `Waveform` component outside the `.map()` loop, pre-allocate shared values
3. Add `const tc = useThemeColors();` at component top
4. Remove the duplicate `Alert` import line
5. Add `const { width: SCREEN_WIDTH } = Dimensions.get('window');`
6. Fix the double-nested JSX fragment condition

**Commit per fix or batch:** `fix(mobile): resolve 6 crash bugs (hooks, imports, undefined vars)`

---

## LAYER 2: Universal Patterns (6.5 → 7.5)

**Impact:** ~10 new utilities/components, referenced from all screen categories.
**Principle:** Build the vocabulary that makes every screen feel premium.

---

### Task 8: Create `formatCount()` Utility

**Files:**
- Create: `apps/mobile/src/utils/formatCount.ts`

**Spec:**
```typescript
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toString();
}
// 999 → "999", 1200 → "1.2K", 15000 → "15K", 1500000 → "1.5M"
```

**Apply everywhere:** Replace raw number displays in PostCard, ThreadCard, ReelItem, profile stats, etc. with `formatCount()`. This is a mass find-and-replace across ~40 files.

**Commit:** `feat(utils): formatCount utility + apply to all engagement counts`

---

### Task 9: Create `useStaggeredEntrance()` Hook

**Files:**
- Create: `apps/mobile/src/hooks/useStaggeredEntrance.ts`

**Spec:**
```typescript
// Provides staggered entrance animation for list items
export function useStaggeredEntrance(index: number, options?: {
  delay?: number;     // base delay per item (default: 40ms)
  duration?: number;  // entrance duration (default: 350ms)
  translateY?: number; // initial offset (default: 20)
}) {
  const { delay = 40, duration = 350, translateY = 20 } = options ?? {};
  const opacity = useSharedValue(0);
  const offset = useSharedValue(translateY);

  useEffect(() => {
    const itemDelay = index * delay;
    opacity.value = withDelay(itemDelay, withTiming(1, { duration }));
    offset.value = withDelay(itemDelay, withTiming(0, {
      duration,
      easing: Easing.bezier(0.16, 1, 0.3, 1), // cinematic
    }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));

  return animatedStyle;
}
```

**Usage in any list renderItem:**
```typescript
const MemoizedItem = memo(function Item({ item, index }) {
  const entranceStyle = useStaggeredEntrance(index);
  return (
    <Animated.View style={entranceStyle}>
      {/* item content */}
    </Animated.View>
  );
});
```

**Apply to:** PostCard, ThreadCard, ConversationItem, all grid items, search results, settings sections.

**Commit:** `feat(hooks): useStaggeredEntrance for cinematic list entrance animations`

---

### Task 10: Create `ProgressiveImage` Component

**Files:**
- Create: `apps/mobile/src/components/ui/ProgressiveImage.tsx`

**Spec (Instagram-style blurhash → full image):**
```typescript
interface ProgressiveImageProps {
  uri: string;
  blurhash?: string;
  width: number | '100%';
  height: number;
  borderRadius?: number;
  contentFit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
}

// Uses expo-image's built-in blurhash support:
// 1. Shows blurhash placeholder immediately (if provided)
// 2. Fades in full image with crossfade transition
// 3. Falls back to emerald shimmer if no blurhash

export function ProgressiveImage({ uri, blurhash, width, height, borderRadius, contentFit = 'cover', style }: ProgressiveImageProps) {
  return (
    <Image
      source={{ uri }}
      placeholder={blurhash ? { blurhash } : undefined}
      transition={350}
      contentFit={contentFit}
      style={[{ width, height, borderRadius: borderRadius ?? 0 }, style]}
    />
  );
}
```

**Apply to:** PostCard images, profile covers, story thumbnails, discover grid, video thumbnails.

**Commit:** `feat(ui): ProgressiveImage with blurhash placeholder + crossfade`

---

### Task 11: Create `SocialProof` Component

**Files:**
- Create: `apps/mobile/src/components/ui/SocialProof.tsx`

**Spec (Instagram's "Liked by X and N others"):**
```typescript
interface SocialProofProps {
  avatars: Array<{ uri: string | null; name: string }>;  // first 2-3 likers
  count: number;
  label?: string;  // "liked by" | "followed by" | "viewed by"
  onPress?: () => void;
}

// Layout:
// [avatar][avatar][avatar] Liked by username and 1,234 others
// Stacked avatars (overlapping by 8px) + bold first username + count
```

**Apply to:** PostCard (below action bar), Profile mutual followers.

**Commit:** `feat(ui): SocialProof component — stacked avatars + count`

---

### Task 12: Create `useContextualHaptic()` Hook

**Files:**
- Create: `apps/mobile/src/hooks/useContextualHaptic.ts`

**Spec:**
```typescript
import * as Haptics from 'expo-haptics';

export function useContextualHaptic() {
  return useMemo(() => ({
    navigation: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    like:       () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    follow:     () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    save:       () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    delete:     () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    error:      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    tick:       () => Haptics.selectionAsync(),
    longPress:  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  }), []);
}
```

**Apply:** Replace all `haptic.light()` calls with contextual variants. Like buttons → `haptic.like()`, tab switches → `haptic.tick()`, follows → `haptic.follow()`, etc.

**Commit:** `feat(hooks): useContextualHaptic — different haptic patterns per action type`

---

### Task 13: Add Double-Tap Heart to PostCard

**Files:**
- Modify: `apps/mobile/src/components/saf/PostCard.tsx`

**What changes:**

PostCard already has double-tap detection logic (lines 189-200). But it's not using `GestureDetector` properly for the image area. Upgrade:

1. Wrap the `PostMedia` component with `GestureDetector` using a double-tap gesture
2. Show the overlay heart animation (already exists — `overlayHeartScale`, `overlayHeartOpacity`)
3. Trigger `FloatingHearts` on double-tap (already wired — `heartTrigger`)
4. Use `haptic.like()` instead of `haptic.medium()`

**Commit:** `feat(saf): double-tap heart on PostCard images (Instagram-style)`

---

### Task 14: Create `useScrollLinkedHeader()` Hook

**Files:**
- Create: `apps/mobile/src/hooks/useScrollLinkedHeader.ts`

**Spec (replaces basic show/hide with elastic collapse):**
```typescript
// Current useScrollDirection: binary show/hide with translateY
// New useScrollLinkedHeader: proportional collapse + blur intensity

export function useScrollLinkedHeader(headerHeight: number = 56) {
  const scrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const headerOpacity = useSharedValue(1);
  const blurIntensity = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      // Proportional collapse: header slides up as user scrolls down
      headerTranslateY.value = interpolate(
        y, [0, headerHeight], [0, -headerHeight], 'clamp'
      );
      // Blur increases as header becomes glass-over-content
      blurIntensity.value = interpolate(y, [0, headerHeight / 2], [0, 60], 'clamp');
      // Opacity fades title as it collapses
      headerOpacity.value = interpolate(y, [0, headerHeight * 0.5], [1, 0], 'clamp');
      scrollY.value = y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  return { onScroll, headerAnimatedStyle, titleAnimatedStyle, blurIntensity, scrollY };
}
```

**Apply to:** Saf feed, Majlis feed, Minbar feed, Profile screen, Discover.

**Commit:** `feat(hooks): useScrollLinkedHeader — elastic collapse with proportional blur`

---

## LAYER 3: Category Sweeps (7.5 → 8.5)

**Impact:** 7 screen categories, each gets a template pattern applied to ALL screens in that group.
**Principle:** Consistency within categories. Every feed looks like a feed. Every settings page looks like settings.

---

### Task 15: Feed Tabs Template (5 screens)

**Screens:** saf.tsx, majlis.tsx, bakra.tsx, minbar.tsx, risalah.tsx

**Universal feed patterns to apply:**
1. Replace `useScrollDirection` with `useScrollLinkedHeader` (elastic collapse)
2. Add staggered entrance to feed items (`useStaggeredEntrance` on renderItem index)
3. Replace raw count numbers with `formatCount()` everywhere
4. Ensure all pull-to-refresh uses emerald tint (already done)
5. Add `CaughtUpCard` animation — fade in + slight bounce
6. Feed type switcher (Following/For You) — add swipe gesture between tabs
7. Content loading: 3 skeleton cards with stagger delay (0ms, 80ms, 160ms)

**Commit per screen or batch:** `feat(feeds): apply universal feed template to all 5 tab screens`

---

### Task 16: Detail Screens Template (~15 screens)

**Screens:** post/[id], thread/[id], reel/[id], video/[id], event-detail, series-detail, product-detail, etc.

**Universal detail patterns:**
1. Parallax hero image (already on profile — apply to all detail screens with hero images)
2. Sticky action bar at bottom (like, comment, share, bookmark) — glass background
3. Comment section: use staggered entrance for comments
4. Related/suggested content section at bottom with horizontal scroll
5. Back button: always use `useAnimatedPress` scale feedback

**Commit:** `feat(detail): apply detail screen template to ~15 screens`

---

### Task 17: List/Browse Screens Template (~40 screens)

**Screens:** discover, search, communities, challenges, marketplace, saved, downloads, etc.

**Universal list patterns:**
1. Search bar + horizontal filter chips at top
2. Staggered entrance for all list items
3. Pull-to-refresh with emerald tint
4. Empty state with relevant icon + action button
5. Grid items: scale-on-press (0.97) via `useAnimatedPress`

**Commit:** `feat(browse): apply list/browse template to ~40 screens`

---

### Task 18: Settings Screens Template (~30 screens)

**Screens:** settings, account-settings, privacy, notifications, content-settings, etc.

**Universal settings patterns:**
1. Grouped sections with gradient header cards
2. Consistent toggle animation (spring, not linear)
3. Consistent spacing: section gap = spacing.xl, item gap = 0 (divider only)
4. Destructive items (delete, deactivate) always at bottom, red text, separated by extra spacing
5. Search bar at top of main settings screen

**Commit:** `feat(settings): apply settings template to ~30 screens`

---

### Task 19: Islamic Screens Template (~25 screens)

**Screens:** prayer-times, quran, dhikr, mosque-finder, zakat, hajj, ramadan, etc.

**Universal Islamic patterns:**
1. Gold accent color for Islamic elements (headers, dividers, icons)
2. Arabic calligraphy text uses `fonts.arabic` / `fonts.arabicBold`
3. Geometric pattern subtle backgrounds (can be a tinted gradient overlay)
4. Staggered entrance with slightly longer delay (60ms vs 40ms — more contemplative feel)
5. Prayer time cards: gradient intensity matches time-of-day (darker at night, lighter at day)

**Commit:** `feat(islamic): apply Islamic template to ~25 screens`

---

### Task 20: Create Screens Template (~13 screens)

**Screens:** create-post, create-thread, create-story, create-reel, create-video, etc.

**Universal creation patterns:**
1. Media-first layout: gallery/camera at top, controls at bottom
2. Floating toolbar with glass background
3. CharCountRing always visible when text input focused
4. Progress steps for multi-step flows (3+ steps)
5. Discard confirmation: BottomSheet with "Discard" (red) + "Save Draft" + "Cancel"

**Commit:** `feat(create): apply creation template to ~13 screens`

---

### Task 21: Messaging Screens Template (~17 screens)

**Screens:** risalah, conversation/[id], conversation-info, chat-folders, etc.

**Universal messaging patterns:**
1. Message bubbles: consistent radius, tail shape
2. Read receipts: double-check icon (not text)
3. Typing indicator: 3 animated dots
4. Scroll-to-bottom FAB when scrolled up
5. Long-press context menu on messages (not Alert)

**Commit:** `feat(messaging): apply messaging template to ~17 screens`

---

## LAYER 4: Hero Polish (8.5 → 9+)

**Impact:** 10 most-used screens get individual hand-crafted attention.
**Principle:** The screens users see 80% of the time must be flawless.

---

### Task 22: Saf Feed — Home Screen (5.5 → 9)

**Individual attention:**
1. Animated gradient story ring on StoryRow avatars (uses upgraded Avatar)
2. SocialProof component on each PostCard ("Liked by X and N others")
3. Comment preview inline (1-2 lines below actions)
4. DM shortcut in header (add message-circle icon next to search)
5. Smooth tab switch animation between Following/For You (shared element underline)
6. "New posts available" banner (real-time, tappable, slides down from top)

**Commit:** `feat(saf): hero polish — social proof, comment preview, DM shortcut, new posts banner`

---

### Task 23: Bakra Feed — Reels (5 → 9)

**Individual attention:**
1. Following | For You tab switcher at top (like TikTok)
2. Single-tap to pause/resume video
3. Spinning audio disc: increase to 44px, add album art thumbnail
4. Sound marquee: scrolling song name text when long
5. Progress bar: thicker (3px), emerald color
6. Comment count, share count, bookmark — all use `formatCount()`
7. "Not interested" swipe-left gesture

**Commit:** `feat(bakra): hero polish — tab switcher, tap-to-pause, audio disc, sound marquee`

---

### Task 24: Profile Screen (6 → 9)

**Individual attention:**
1. Stretchy header: pull-down stretches cover photo (uses `useAnimatedScrollHandler`)
2. Sticky tab bar (Posts / Reels / Tagged) — sticks below header on scroll
3. Grid items: scale-on-press (0.97), fade-in stagger
4. Stats (posts, followers, following) — use `formatCount()`, tap to navigate
5. Follow button: confetti burst animation on follow success
6. Story highlights row: horizontal scroll with named circles

**Commit:** `feat(profile): hero polish — stretchy header, sticky tabs, confetti follow`

---

### Task 25: Prayer Times (5.8 → 9.5)

**Individual attention:**
1. Sky gradient background that changes by time-of-day (dark blue at night → orange at dawn → blue at day → gold at sunset)
2. Current prayer card: more prominent, emerald glow border, larger font
3. Countdown timer: large display font with tabular figures
4. Adhan notification toggles per prayer (already backend-supported)
5. Pull-down to reveal Qibla compass widget
6. Islamic geometric pattern overlay (subtle, 3% opacity)

**Commit:** `feat(prayer): hero polish — sky gradient, Qibla pull-down, geometric patterns`

---

### Task 26-31: Remaining Hero Screens

Apply same individual attention pattern to:
- **Task 26:** Conversation view — attach menu, link previews, scroll-to-bottom FAB
- **Task 27:** Create Post — custom gallery grid, aspect ratio, filters preview
- **Task 28:** Settings — search bar, profile hero card, SectionList with sticky headers
- **Task 29:** Notifications — thumbnails, follow-back buttons inline, mark-all-read
- **Task 30:** Discover — masonry grid (mixed 1x1 + 2x2), auto-play video thumbs
- **Task 31:** Story Viewer — swipe between users (#1 missing Instagram feature)

---

## EXECUTION STRATEGY

### Parallel Agent Architecture

```
Phase 0: Preparation (this plan)           ← YOU ARE HERE
Phase 1: Layer 1 Foundation (Tasks 1-7)    ← Sequential, 1 agent, ~2 hours
Phase 2: Layer 2 Patterns (Tasks 8-14)     ← 3-4 parallel agents, ~1 hour
Phase 3: Layer 3 Sweeps (Tasks 15-21)      ← 7 parallel agents (one per category), ~2 hours
Phase 4: Layer 4 Hero (Tasks 22-31)        ← 10 parallel agents (one per screen), ~2 hours
```

### Phase 1 MUST be sequential (foundation)
Tasks 1-7 modify shared components. Cannot parallelize — each subsequent task depends on the previous.

### Phase 2 can be partially parallel
Tasks 8-14 create new files (no conflicts). Can run 3-4 agents simultaneously.

### Phase 3 is fully parallel
Tasks 15-21 each touch different screen files. 7 agents, one per category, zero conflicts.

### Phase 4 is fully parallel
Tasks 22-31 each touch one specific screen. 10 agents, zero conflicts.

### Testing Strategy

- **Layer 1:** Manual verification (theme, component rendering). Run existing test suite to ensure no regressions.
- **Layer 2:** Unit tests for utilities (`formatCount`, hooks). Snapshot tests for new components.
- **Layer 3-4:** Run full test suite after each batch. Visual spot-check on 5 representative screens per category.

### Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Shared component change breaks screens | Layer 1 is sequential + test suite after each commit |
| Parallel agents create merge conflicts | Each agent touches different files by design |
| Animation performance on low-end devices | All animations use native driver (transform/opacity only) |
| Light mode regressions | Task 2 fixes this systematically before anything else |
| Agent quality for screen-level work | Each agent gets precise rules + bounded scope |

---

## SUCCESS METRICS

| Metric | Before | After Layer 1 | After Layer 2 | After Layer 3 | After Layer 4 |
|--------|--------|---------------|---------------|---------------|---------------|
| Overall Score | 4.8/10 | 6.5/10 | 7.5/10 | 8.5/10 | 9.0/10 |
| Crash Bugs | 6 | 0 | 0 | 0 | 0 |
| Toast System | 0/10 | 8/10 | 8/10 | 8/10 | 8/10 |
| Light Mode | Broken | Working | Working | Working | Working |
| Stagger Animations | 0 screens | 0 | 208 screens | 208 | 208 |
| Social Proof | 0 screens | 0 | 0 | Saf only | Saf + Profile |
| Haptic Variety | 1 pattern | 1 | 8 patterns | 8 | 8 |
| Story Ring Animated | No | Yes | Yes | Yes | Yes |
| Skeleton Brand Shimmer | No | Yes | Yes | Yes | Yes |

---

## FILES CHANGED SUMMARY

| Layer | New Files | Modified Files | Total Screens Affected |
|-------|-----------|----------------|----------------------|
| Layer 1 | 1 (Toast) | ~10 (theme, components) | 208 (all) |
| Layer 2 | 5 (utils, hooks, components) | ~40 (apply utilities) | 208 (all) |
| Layer 3 | 0 | ~130 (category sweeps) | ~130 |
| Layer 4 | 0 | ~10 (hero screens) | 10 |
| **Total** | **6** | **~190** | **208** |
