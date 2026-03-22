# Mizanly UI Visual Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate every screen from "functional MVP" to billion-dollar-app visual quality by upgrading shared components first (cascade effect), then systematically polishing all screens with animations, gradients, glassmorphism, haptics, and brand personality.

**Architecture:** Component-first cascade — upgrade 15 shared components (Phase 1) so changes ripple to all 80+ screens automatically, then polish core screens (Phase 2), secondary screens (Phase 3), and tertiary screens (Phase 4). Phases 2-4 are independent and can run in parallel after Phase 1 completes.

**Tech Stack:** React Native, Expo SDK 52, react-native-reanimated, expo-linear-gradient, expo-blur (BlurView), expo-haptics, @shopify/flash-list

**Design System (already defined in `apps/mobile/src/theme/index.ts`):**
- Brand: emerald `#0A7B4F`, emeraldLight `#0D9B63`, gold `#C8963E`, goldLight `#D4A94F`
- Dark theme: bg `#0D1117`, bgElevated `#161B22`, bgCard `#1C2333`, bgSheet `#21283B`
- Springs: bouncy(D10 S400), snappy(D12 S300), responsive(D15 S150), gentle(D20 S100)
- Glass: light(40), medium(60), heavy(80) blur intensities
- Fonts: PlayfairDisplay (heading), DMSans (body), NotoNaskhArabic (arabic)

**MANDATORY RULES (never violate):**
1. Modals -> `<BottomSheet>` + `<BottomSheetItem>` -- NEVER RN `Modal`
2. Loading -> `<Skeleton.*>` -- NEVER bare `<ActivityIndicator>` (OK in buttons only)
3. Empty states -> `<EmptyState icon title />` -- NEVER bare text
4. Back/close -> `<Icon name="arrow-left/x" />` -- NEVER emoji text
5. Verified -> `<VerifiedBadge size={13} />` -- NEVER checkmark text
6. Char counts -> `<CharCountRing current max />` -- NEVER plain text
7. Round radius -> `radius.full` (9999) -- NEVER hardcoded `borderRadius: 20`
8. Gradients -> `expo-linear-gradient` -- NEVER CSS string
9. Pull-to-refresh -> `<RefreshControl tintColor={colors.emerald} />`
10. ALL FlatLists must have `<RefreshControl>`

**Import Aliases:**
- `@/theme` -> `apps/mobile/src/theme/index.ts`
- `@/components/ui/*` -> `apps/mobile/src/components/ui/*`
- `@/hooks/*` -> `apps/mobile/src/hooks/*`
- `@/services/api` -> `apps/mobile/src/services/api.ts`
- `@/store` -> `apps/mobile/src/store/index.ts`
- `@/types` -> `apps/mobile/src/types/index.ts`

---

## Phase 1: Component Supercharge (Agents 1-5)

### Agent 1: New Shared Hooks + Utility Components

**Files to CREATE:**
- `apps/mobile/src/hooks/useEntranceAnimation.ts`
- `apps/mobile/src/hooks/usePulseGlow.ts`
- `apps/mobile/src/components/ui/GradientButton.tsx`
- `apps/mobile/src/components/ui/GlassHeader.tsx`

**DO NOT touch any existing files. Only create new files.**

#### Step 1: Create `useEntranceAnimation` hook

Create `apps/mobile/src/hooks/useEntranceAnimation.ts`:

```tsx
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { animation } from '@/theme';

interface Options {
  delay?: number;
  translateY?: number;
  duration?: number;
}

export function useEntranceAnimation(options?: Options) {
  const { delay = 0, translateY = 20, duration = animation.timing.normal } = options ?? {};
  const opacity = useSharedValue(0);
  const translate = useSharedValue(translateY);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    translate.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, opacity, translate, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  return { animatedStyle };
}
```

#### Step 2: Create `usePulseGlow` hook

Create `apps/mobile/src/hooks/usePulseGlow.ts`:

```tsx
import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface Options {
  minOpacity?: number;
  maxOpacity?: number;
  duration?: number;
}

export function usePulseGlow(options?: Options) {
  const { minOpacity = 0.6, maxOpacity = 1.0, duration = 1500 } = options ?? {};
  const opacity = useSharedValue(maxOpacity);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(minOpacity, { duration, easing: Easing.inOut(Easing.sine) }),
      -1,
      true,
    );
  }, [opacity, minOpacity, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return { animatedStyle };
}
```

#### Step 3: Create `GradientButton` component

Create `apps/mobile/src/components/ui/GradientButton.tsx`:

```tsx
import { useCallback } from 'react';
import { Text, StyleSheet, ActivityIndicator, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation, shadow } from '@/theme';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GradientButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth,
  size = 'md',
}: GradientButtonProps) {
  const scale = useSharedValue(1);
  const haptic = useHaptic();

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, animation.spring.snappy);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, animation.spring.snappy);
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    haptic.light();
    onPress();
  }, [disabled, loading, haptic, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sizeStyles = {
    sm: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, fontSize: fontSize.sm },
    md: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2, fontSize: fontSize.base },
    lg: { paddingHorizontal: spacing['2xl'], paddingVertical: spacing.md, fontSize: fontSize.md },
  };

  const s = sizeStyles[size];

  if (variant === 'ghost') {
    return (
      <AnimatedPressable
        style={[styles.ghost, animatedStyle, fullWidth && styles.fullWidth]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {icon && <View style={styles.iconGap}>{icon}</View>}
        <Text style={[styles.ghostText, { fontSize: s.fontSize }]}>{label}</Text>
      </AnimatedPressable>
    );
  }

  if (variant === 'secondary') {
    return (
      <AnimatedPressable
        style={[
          styles.secondary,
          { paddingHorizontal: s.paddingHorizontal, paddingVertical: s.paddingVertical },
          animatedStyle,
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {icon && <View style={styles.iconGap}>{icon}</View>}
        {loading ? (
          <ActivityIndicator color={colors.emerald} size="small" />
        ) : (
          <Text style={[styles.secondaryText, { fontSize: s.fontSize }]}>{label}</Text>
        )}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      style={[animatedStyle, fullWidth && styles.fullWidth, disabled && styles.disabled]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
    >
      <LinearGradient
        colors={[colors.emeraldLight, colors.emerald]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.primary,
          { paddingHorizontal: s.paddingHorizontal, paddingVertical: s.paddingVertical },
        ]}
      >
        {icon && <View style={styles.iconGap}>{icon}</View>}
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.primaryText, { fontSize: s.fontSize }]}>{label}</Text>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
    shadowColor: colors.emerald,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondary: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  secondaryText: {
    color: colors.emerald,
    fontWeight: '700',
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  ghostText: {
    color: colors.emerald,
    fontWeight: '600',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  iconGap: {
    marginRight: spacing.sm,
  },
});
```

#### Step 4: Create `GlassHeader` component

Create `apps/mobile/src/components/ui/GlassHeader.tsx`:

```tsx
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, glass } from '@/theme';

interface GlassHeaderProps {
  title?: string;
  titleComponent?: React.ReactNode;
  leftAction?: {
    icon: React.ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
  };
  rightActions?: Array<{
    icon: React.ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
    badge?: React.ReactNode;
  }>;
  borderless?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function HeaderButton({ icon, onPress, accessibilityLabel, badge }: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  badge?: React.ReactNode;
}) {
  const press = useAnimatedPress({ scaleTo: 0.88 });
  const haptic = useHaptic();

  return (
    <AnimatedPressable
      style={[styles.headerBtn, press.animatedStyle]}
      onPress={() => { haptic.light(); onPress(); }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {icon}
      {badge}
    </AnimatedPressable>
  );
}

export function GlassHeader({ title, titleComponent, leftAction, rightActions, borderless }: GlassHeaderProps) {
  const content = (
    <View style={[styles.inner, borderless && styles.borderless]}>
      <View style={styles.left}>
        {leftAction && (
          <HeaderButton
            icon={leftAction.icon}
            onPress={leftAction.onPress}
            accessibilityLabel={leftAction.accessibilityLabel}
          />
        )}
      </View>
      <View style={styles.center}>
        {titleComponent ?? (
          title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null
        )}
      </View>
      <View style={styles.right}>
        {rightActions?.map((action, i) => (
          <HeaderButton
            key={i}
            icon={action.icon}
            onPress={action.onPress}
            accessibilityLabel={action.accessibilityLabel}
            badge={action.badge}
          />
        ))}
      </View>
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.container}>
        {content}
      </BlurView>
    );
  }

  return (
    <View style={[styles.container, styles.androidBg]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  androidBg: {
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.glass.border,
  },
  borderless: {
    borderBottomWidth: 0,
  },
  left: {
    width: 44,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  right: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

#### Step 5: Commit

```bash
git add apps/mobile/src/hooks/useEntranceAnimation.ts apps/mobile/src/hooks/usePulseGlow.ts apps/mobile/src/components/ui/GradientButton.tsx apps/mobile/src/components/ui/GlassHeader.tsx
git commit -m "feat(ui): add GradientButton, GlassHeader, useEntranceAnimation, usePulseGlow"
```

---

### Agent 2: Upgrade Core UI Components (EmptyState, BottomSheet, TabSelector, Badge)

**Files to MODIFY:**
- `apps/mobile/src/components/ui/EmptyState.tsx`
- `apps/mobile/src/components/ui/BottomSheet.tsx`
- `apps/mobile/src/components/ui/Badge.tsx`
- `apps/mobile/src/components/ui/TabSelector.tsx`

**IMPORTANT:** Read each file FULLY before modifying. Preserve all existing props and behavior. Only ADD visual enhancements.

#### EmptyState.tsx changes:

1. Add entrance animation (fade+slide up) using `useEntranceAnimation`
2. Icon circle: add subtle emerald border (`colors.active.emerald20`)
3. Action button: replace flat emerald bg with `GradientButton` import
4. Fix hardcoded `borderRadius: 32` -> `radius.full`

Key modifications:
- Import `Animated` from `react-native-reanimated`
- Import `{ useEntranceAnimation }` from `@/hooks/useEntranceAnimation`
- Import `{ GradientButton }` from `./GradientButton`
- Import `{ radius }` from `@/theme`
- Wrap container in `<Animated.View style={animatedStyle}>`
- `iconWrap.borderRadius` -> `radius.full`
- `iconWrap` add `borderWidth: 1, borderColor: colors.active.emerald20`
- Replace TouchableOpacity action button with `<GradientButton label={actionLabel} onPress={onAction} size="sm" />`
- Remove `actionBtn` and `actionText` styles (no longer needed)

#### BottomSheet.tsx changes:

1. Add `haptic.light()` call in `close()` function
2. Android fallback: change from solid `colors.dark.bgSheet` to `rgba(33, 40, 59, 0.92)` with top border `colors.glass.border`
3. BottomSheetItem: add `useAnimatedPress` scale(0.98) + `haptic.selection()` on press

Key modifications:
- Import `{ useHaptic }` from `@/hooks/useHaptic`
- Import `{ useAnimatedPress }` from `@/hooks/useAnimatedPress`
- In `close()`: add `haptic.light()` before the timeout
- Need to instantiate haptic inside the component: `const haptic = useHaptic();`
- Android View fallback: `backgroundColor: 'rgba(33, 40, 59, 0.92)'`, add `borderTopWidth: 0.5, borderTopColor: colors.glass.border`
- BottomSheetItem: wrap with AnimatedPressable using useAnimatedPress, add haptic.selection on press

#### Badge.tsx changes:

1. Add emerald glow shadow when count > 0
2. Add subtle pulse when count increases

Key modifications:
- Add `shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4` to badge style when visible

#### TabSelector.tsx changes:

1. Underline indicator: thicken to 3px, add emerald glow shadow
2. Pill active: add subtle border on active pill, increase label contrast
3. Active underline label: make bold (fontWeight: '700')

Key modifications:
- `underlineIndicator.height`: 2.5 -> 3
- Add `shadowColor: colors.emerald, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 3` to underlineIndicator
- `pillIndicator`: add `borderWidth: 0.5, borderColor: colors.glass.border`
- `underlineLabelActive`: add `fontWeight: '700'`
- `pillLabelActive`: add `fontWeight: '700'`

#### Commit:
```bash
git add apps/mobile/src/components/ui/EmptyState.tsx apps/mobile/src/components/ui/BottomSheet.tsx apps/mobile/src/components/ui/Badge.tsx apps/mobile/src/components/ui/TabSelector.tsx
git commit -m "feat(ui): upgrade EmptyState, BottomSheet, Badge, TabSelector with animations and brand polish"
```

---

### Agent 3: Upgrade Content Components (PostCard, ThreadCard, StoryRow, StoryBubble, CommentsSheet)

**Files to MODIFY:**
- `apps/mobile/src/components/saf/PostCard.tsx`
- `apps/mobile/src/components/majlis/ThreadCard.tsx`
- `apps/mobile/src/components/saf/StoryRow.tsx`
- `apps/mobile/src/components/saf/StoryBubble.tsx`
- `apps/mobile/src/components/bakra/CommentsSheet.tsx`

**IMPORTANT:** Read each file FULLY before modifying. These are complex components. Preserve ALL existing props, behavior, and logic.

#### PostCard.tsx changes:
- Double-tap heart: after existing heart overlay, add 3 small floating heart views that animate upward (translateY -200, opacity 0, random rotation) over 800ms. Use `withTiming` not `withSpring` for float-up.
- Action bar: increase gap from `spacing.xs` to `spacing.md` for breathing room
- Bookmark active: change color to `colors.gold` (check if already done)
- Sensitive content overlay: replace hardcoded `rgba(13,17,23,0.85)` with `colors.glass.dark`

#### ThreadCard.tsx changes:
- Thread connecting line: add subtle emerald tint (`rgba(10, 123, 79, 0.3)`) instead of plain border color
- Poll result bars: use emerald-to-emeraldLight gradient fill via LinearGradient instead of solid color
- Action icons: increase hitSlop from default to `{ top: 8, bottom: 8, left: 8, right: 8 }`

#### StoryRow.tsx changes:
- Import `useEntranceAnimation` and apply to the container with delay=0
- This is a simple component (57 lines), minimal changes needed

#### StoryBubble.tsx changes:
- Already has excellent pulse animation -- keep as-is
- Name text: add `textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2` for readability

#### CommentsSheet.tsx changes:
- Send button: replace "Send" text with `<Icon name="send" size="sm" color={colors.emerald} />` wrapped in a Pressable with scale press animation
- Comment rows: add subtle left border on original poster's comments: `borderLeftWidth: 2, borderLeftColor: colors.emerald`

#### Commit:
```bash
git add apps/mobile/src/components/saf/PostCard.tsx apps/mobile/src/components/majlis/ThreadCard.tsx apps/mobile/src/components/saf/StoryRow.tsx apps/mobile/src/components/saf/StoryBubble.tsx apps/mobile/src/components/bakra/CommentsSheet.tsx
git commit -m "feat(ui): upgrade PostCard, ThreadCard, StoryBubble, CommentsSheet with animations and brand polish"
```

---

### Agent 4: Upgrade Media & Display Components (VideoPlayer, RichText, ImageLightbox)

**Files to MODIFY:**
- `apps/mobile/src/components/ui/VideoPlayer.tsx`
- `apps/mobile/src/components/ui/RichText.tsx`
- `apps/mobile/src/components/ui/ImageLightbox.tsx`

#### VideoPlayer.tsx changes:
- Replace bare `ActivityIndicator` on lines ~204, ~211 with `<Skeleton.Rect>` shimmer
- Import `{ Skeleton }` from `./Skeleton`
- Progress bar: ensure it uses `colors.emerald` fill color
- Controls overlay: ensure LinearGradient is used (already is, verify)

#### RichText.tsx changes:
- Hashtag taps: add `haptic.light()` before navigation
- Mention taps: add `haptic.light()` before navigation
- URL taps: add `haptic.light()` before `Linking.openURL`
- Import `{ useHaptic }` from `@/hooks/useHaptic`

#### ImageLightbox.tsx changes:
- Read file first to understand current implementation
- Ensure background uses blur/dark overlay not solid black
- Close gesture: ensure swipe-down dismisses with translateY animation

#### Commit:
```bash
git add apps/mobile/src/components/ui/VideoPlayer.tsx apps/mobile/src/components/ui/RichText.tsx apps/mobile/src/components/ui/ImageLightbox.tsx
git commit -m "feat(ui): fix VideoPlayer loading states, add haptics to RichText, polish ImageLightbox"
```

---

### Agent 5: New Celebration Components (FloatingHearts, CaughtUpCard, ToastNotification)

**Files to CREATE:**
- `apps/mobile/src/components/ui/FloatingHearts.tsx`
- `apps/mobile/src/components/ui/CaughtUpCard.tsx`
- `apps/mobile/src/components/ui/ToastNotification.tsx`

**DO NOT touch any existing files. Only create new files.**

#### FloatingHearts.tsx:

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { colors } from '@/theme';

interface FloatingHeart {
  id: number;
  x: number;
  rotation: number;
  size: number;
}

interface FloatingHeartsProps {
  trigger: number; // increment to trigger burst
  color?: string;
  count?: number;
}

function Heart({ x, rotation, size, onDone }: FloatingHeart & { onDone: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(2)) });
    translateY.value = withTiming(-200 - Math.random() * 100, { duration: 900, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 900, easing: Easing.in(Easing.cubic) }, () => {
      runOnJS(onDone)();
    });
    rotate.value = withTiming(rotation, { duration: 900 });
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.heart, { left: x }, style]}>
      <Icon name="heart-filled" size={size} color={colors.like} />
    </Animated.View>
  );
}

export function FloatingHearts({ trigger, color, count = 5 }: FloatingHeartsProps) {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);

  useEffect(() => {
    if (trigger <= 0) return;
    const newHearts: FloatingHeart[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: -20 + Math.random() * 40,
      rotation: -30 + Math.random() * 60,
      size: 18 + Math.random() * 14,
    }));
    setHearts((prev) => [...prev, ...newHearts]);
  }, [trigger, count]);

  const removeHeart = (id: number) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  };

  if (hearts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {hearts.map((h) => (
        <Heart key={h.id} {...h} onDone={() => removeHeart(h.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: {
    position: 'absolute',
  },
});
```

#### CaughtUpCard.tsx:

```tsx
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { colors, spacing, fontSize, animation, radius } from '@/theme';

export function CaughtUpCard() {
  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(200, withSpring(1, animation.spring.bouncy));
    ringScale.value = withDelay(200, withSpring(1.4, { damping: 8, stiffness: 80 }));
    ringOpacity.value = withDelay(200, withTiming(0.3, { duration: 600 }));
    textOpacity.value = withDelay(500, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={checkStyle}>
          <View style={styles.checkCircle}>
            <Icon name="check" size="lg" color="#fff" />
          </View>
        </Animated.View>
      </View>
      <Animated.View style={textStyle}>
        <Text style={styles.title}>You're all caught up</Text>
        <Text style={styles.subtitle}>You've seen all new posts from the last 3 days</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  iconContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
```

#### ToastNotification.tsx:

```tsx
import { useEffect, useCallback } from 'react';
import { Text, StyleSheet, Platform, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, spacing, fontSize, radius, animation, glass, shadow } from '@/theme';

interface ToastNotificationProps {
  visible: boolean;
  message: string;
  icon?: React.ReactNode;
  duration?: number;
  onDismiss: () => void;
}

export function ToastNotification({ visible, message, icon, duration = 2500, onDismiss }: ToastNotificationProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, animation.spring.responsive);
      opacity.value = withTiming(1, { duration: 200 });
      // Auto-dismiss
      translateY.value = withDelay(duration, withSpring(-100, animation.spring.responsive));
      opacity.value = withDelay(duration, withTiming(0, { duration: 200 }, () => {
        runOnJS(dismiss)();
      }));
    }
  }, [visible, duration, translateY, opacity, dismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const content = (
    <View style={styles.inner}>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.blurWrap}>
          {content}
        </BlurView>
      ) : (
        <View style={[styles.blurWrap, styles.androidBg]}>
          {content}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.base,
    right: spacing.base,
    zIndex: 9999,
    ...shadow.lg,
  },
  blurWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  androidBg: {
    backgroundColor: 'rgba(33, 40, 59, 0.95)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
```

#### Commit:
```bash
git add apps/mobile/src/components/ui/FloatingHearts.tsx apps/mobile/src/components/ui/CaughtUpCard.tsx apps/mobile/src/components/ui/ToastNotification.tsx
git commit -m "feat(ui): add FloatingHearts, CaughtUpCard, ToastNotification celebration components"
```

---

## Phase 2: Core Screens (Agents 6-15)

### Agent 6: Tab Bar + Navigation

**File to MODIFY:** `apps/mobile/app/(tabs)/_layout.tsx`

Read the file fully first. Then apply these changes:

1. **Remove tab labels** -- set `tabBarShowLabel: false` in screenOptions
2. **Active indicator** -- replace 4px dot with emerald pill background: `width: 48, height: 28, borderRadius: radius.full, backgroundColor: colors.active.emerald20` behind icon when focused
3. **Haptic on tab press** -- add `tabBarButton` custom component that calls `haptic.selection()` on press
4. **Android tab bg** -- change from `rgba(13,17,23,0.97)` to `rgba(13,17,23,0.85)` + add `borderTopColor: 'rgba(10, 123, 79, 0.15)'`
5. **Create button** -- change from 48x36 rectangle to 44x44 circle. Keep gradient + shadow.
6. **CreateButton sheet** -- add descriptive subtitles to each item: "Post" -> "Share a photo or video", etc.

Commit: `"feat(ui): polish tab bar with pill indicator, haptics, glass improvements"`

---

### Agent 7: Saf Feed (Instagram)

**File to MODIFY:** `apps/mobile/app/(tabs)/saf.tsx`

Read the file fully first. Then:

1. **Logo** -- change `fontWeight: '700'` to `fontFamily: fonts.headingBold` (import fonts from theme). Keep emerald color. Change `letterSpacing: -0.5` to `-1`.
2. **"You're all caught up"** -- replace inline checkmark + text with `<CaughtUpCard />` (import from `@/components/ui/CaughtUpCard`)
3. **Empty state** -- change title to "Your feed is waiting" and subtitle to "Follow creators who inspire you". Add `actionLabel="Explore" onAction={() => router.push('/(screens)/discover')}`
4. **TabSelector pill** -- add `style={{ marginHorizontal: spacing.base }}` for breathing room

Commit: `"feat(ui): polish Saf feed with branded header, CaughtUpCard, personality empty state"`

---

### Agent 8: Majlis Feed (X/Twitter)

**File to MODIFY:** `apps/mobile/app/(tabs)/majlis.tsx`

Read the file fully first. Then:

1. **Logo** -- same PlayfairDisplay-Bold treatment as Saf
2. **FAB position** -- change `bottom: 100` to `bottom: tabBar.height + 16` (import tabBar from theme)
3. **Hashtag chips** -- add border: `borderWidth: 1, borderColor: colors.dark.border`, add `useAnimatedPress` scale on press
4. **Tab switcher** -- ensure using "underline" variant (not "pill") for X-like feel
5. **Trending section header** -- add gold icon: `<Icon name="trending-up" size="sm" color={colors.gold} />` next to "Trending"
6. **Empty state** -- "Be the voice. Start a thread." + actionLabel "Write" + onAction to create-thread

Commit: `"feat(ui): polish Majlis feed with branded header, FAB position, trend accents"`

---

### Agent 9: Risalah (WhatsApp Messaging)

**File to MODIFY:** `apps/mobile/app/(tabs)/risalah.tsx`

Read the file fully first. Then:

1. **Unread conversations** -- add left emerald border accent (3px) to unread conv rows, bold name text
2. **Online indicator** -- increase dot size to 10px, add emerald shadow glow: `shadowColor: colors.emerald, shadowRadius: 4, shadowOpacity: 0.5`
3. **Filter chips** -- add border to inactive chips, emerald fill + white text on active
4. **FAB** -- change icon to megaphone-style, use emerald gradient circle
5. **Empty state** -- "Your conversations will live here" + GradientButton "New Message"
6. **Logo** -- PlayfairDisplay-Bold treatment

Commit: `"feat(ui): polish Risalah with unread accents, online glow, filter animations"`

---

### Agent 10: Bakra (TikTok)

**File to MODIFY:** `apps/mobile/app/(tabs)/bakra.tsx`

Read the file fully first. Then:

1. **Double-tap** -- import `FloatingHearts` from `@/components/ui/FloatingHearts`. Add state `const [heartTrigger, setHeartTrigger] = useState(0)`. In doubleTapGesture.onEnd, add `setHeartTrigger(t => t + 1)`. Render `<FloatingHearts trigger={heartTrigger} />` inside ReelItem above the action column.
2. **Action buttons** -- replace `TouchableOpacity` action buttons with `ActionButton` component (import from `@/components/ui/ActionButton`). This gives bounce + haptic automatically.
3. **Follow button** -- increase size from 20x20 to 26x26, add LinearGradient fill (emeraldLight -> emerald)
4. **Caption** -- add "more" link: if text > 3 lines, show "more" in emerald that expands via `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)`
5. **Header** -- replace solid header with GlassHeader overlaying video, title "Bakra"
6. **Duet/Stitch buttons** -- change bg from `rgba(255,255,255,0.15)` to glass-style: add `borderWidth: 0.5, borderColor: colors.glass.border`

Commit: `"feat(ui): add floating hearts, polish Bakra actions, glass header, caption expand"`

---

### Agent 11: Minbar (YouTube)

**File to MODIFY:** `apps/mobile/app/(tabs)/minbar.tsx`

Read the file fully first. Then:

1. **Category chips** -- add press scale animation, active: `backgroundColor: colors.emerald, color: '#fff'`
2. **Video thumbnails** -- add `borderRadius: radius.md, ...shadow.sm` to thumbnail containers
3. **Duration badge** -- replace hardcoded rgba with glass blur: `backgroundColor: 'rgba(0,0,0,0.7)'` + `borderRadius: radius.sm`
4. **Continue Watching progress bar** -- emerald fill bar below thumbnail
5. **Section headers** -- add "See all >" link in emerald text + chevron-right icon
6. **Logo** -- PlayfairDisplay-Bold treatment

Commit: `"feat(ui): polish Minbar with chip animations, thumbnail shadows, progress bars"`

---

### Agent 12: Profile Page

**File to MODIFY:** `apps/mobile/app/(screens)/profile/[username].tsx`

Read the file fully first (it's 1600+ lines). Then:

1. **Cover image** -- add dark gradient overlay: `<LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} />` over bottom 50%
2. **Follow button** -- replace with `<GradientButton label="Follow" />`. For "Following" state, use `variant="secondary"` with checkmark icon
3. **Stats row** -- make tappable: wrap each stat in Pressable with scale animation + navigate to followers/following
4. **Tab indicator** -- ensure TabSelector uses underline variant with 3px emerald bar (already should from Agent 2)
5. **Grid items** -- add `useAnimatedPress` scale(0.96) on press for post grid items
6. **Story highlights** -- add name labels below highlight circles

Commit: `"feat(ui): polish profile with cover gradient, GradientButton follow, tappable stats, grid press"`

---

### Agent 13: Post Detail

**File to MODIFY:** `apps/mobile/app/(screens)/post/[id].tsx`

Read the file fully first. Then:

1. **Comment bubbles** -- add `borderLeftWidth: 2, borderLeftColor: colors.emerald` for OP comments, `borderLeftColor: 'transparent'` for others. Add `borderRadius: radius.md, ...shadow.sm`
2. **Send button** -- replace "Send" text with `<Icon name="send" size="sm" color={colors.emerald} />` with scale press animation
3. **Empty comments** -- "Start the conversation" + auto-focus input on action
4. **Header** -- replace with `GlassHeader`
5. **Like on comments** -- use `ActionButton` for comment likes

Commit: `"feat(ui): polish post detail with comment styling, GlassHeader, ActionButton likes"`

---

### Agent 14: Conversation Detail

**File to MODIFY:** `apps/mobile/app/(screens)/conversation/[id].tsx`

Read the file fully first (it's 1600+ lines). Then:

1. **Own message bubbles** -- add LinearGradient: `colors={[colors.emeraldLight, colors.emerald]}` instead of solid color
2. **Other message bubbles** -- add subtle border: `borderWidth: 0.5, borderColor: colors.dark.border`
3. **Message status** -- emerald color for "read" double-check, gray for "delivered"
4. **Input bar** -- add glass blur background, rounded input with `borderRadius: radius.full`
5. **Header** -- replace with `GlassHeader`

Commit: `"feat(ui): polish conversation with gradient bubbles, glass input, status colors"`

---

### Agent 15: Thread Detail

**File to MODIFY:** `apps/mobile/app/(screens)/thread/[id].tsx`

Read the file fully first. Then:

1. **Thread line** -- change color to `rgba(10, 123, 79, 0.3)`, width to 2px
2. **Reply actions** -- increase icon size from 16 to 20, add `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}`
3. **Reply input** -- glass blur bar with avatar + placeholder "Reply to thread..."
4. **Header** -- replace with `GlassHeader`
5. **Like animation** -- use `ActionButton` for reply likes

Commit: `"feat(ui): polish thread detail with emerald line, larger actions, glass input"`

---

## Phase 3: Secondary Screens (Agents 16-21)

### Agent 16: Search + Discover

**Files to MODIFY:**
- `apps/mobile/app/(screens)/discover.tsx`
- `apps/mobile/app/(screens)/search.tsx`
- `apps/mobile/app/(screens)/search-results.tsx`

1. **discover.tsx**: Replace hardcoded `fontFamily: 'DMSans-SemiBold'` with `fontWeight: '600'` (theme-safe). Header -> GlassHeader. Hashtag chips -> add border + press scale. Grid items -> press scale(0.96). Trending header -> add gold trending-up icon.
2. **search.tsx**: Header -> GlassHeader with search input. Search input -> emerald focus border. Result rows -> add press animation.
3. **search-results.tsx**: GlassHeader. Follow buttons -> GradientButton.

Commit: `"feat(ui): polish discover grid, search input, fix hardcoded fonts"`

---

### Agent 17: Notifications

**File to MODIFY:** `apps/mobile/app/(screens)/notifications.tsx`

1. Header -> GlassHeader
2. Accept button -> GradientButton size="sm". Decline -> GradientButton variant="ghost"
3. "Mark all read" -> add press scale animation
4. Add section grouping: "Today", "This Week", "Earlier" headers between notification groups (group by date)

Commit: `"feat(ui): polish notifications with GlassHeader, GradientButton actions, time grouping"`

---

### Agent 18: Settings + Account Settings

**Files to MODIFY:**
- `apps/mobile/app/(screens)/settings.tsx`
- `apps/mobile/app/(screens)/account-settings.tsx`

1. **Settings rows** -- add haptic.selection on press, subtle press bg change (`colors.active.white5`)
2. **Section headers** -- add 3px emerald left border accent
3. **Sections** -- wrap groups in card-style containers with `backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.dark.border`
4. **Sign out** -- full-width outlined error button with log-out icon at bottom
5. **Header** -- GlassHeader
6. **Account settings** -- same card grouping treatment

Commit: `"feat(ui): polish settings with card grouping, haptics, emerald accents"`

---

### Agent 19: Create Flows

**Files to MODIFY:**
- `apps/mobile/app/(screens)/create-post.tsx`
- `apps/mobile/app/(screens)/create-thread.tsx`
- `apps/mobile/app/(screens)/create-story.tsx`
- `apps/mobile/app/(screens)/create-reel.tsx`
- `apps/mobile/app/(screens)/create-video.tsx`

1. **All**: Post/Publish button -> GradientButton. Header -> GlassHeader.
2. **create-post**: Visibility pill -> add icon (globe/users/lock) + label. Media thumbnails -> 120x120 with rounded corners.
3. **create-thread**: Thread parts -> add emerald connecting line between parts.
4. **create-story**: Gradient selector -> larger swatches with active ring.
5. **create-reel**: Audio picker styling. Post button -> GradientButton.
6. **create-video**: Category chips -> emerald active fill with white text. Upload -> GradientButton.

Commit: `"feat(ui): polish all create flows with GradientButton, GlassHeader, visual upgrades"`

---

### Agent 20: Auth + Onboarding

**Files to MODIFY:**
- `apps/mobile/app/(auth)/sign-in.tsx`
- `apps/mobile/app/(auth)/sign-up.tsx`
- `apps/mobile/app/onboarding/username.tsx`
- `apps/mobile/app/onboarding/interests.tsx`
- `apps/mobile/app/onboarding/profile.tsx`
- `apps/mobile/app/onboarding/suggested.tsx`

1. **sign-in/sign-up**: Logo -> PlayfairDisplay-Bold. Inputs -> emerald focus border (track focus state, toggle borderColor). Button -> GradientButton. Footer "Sign up" link -> gold color.
2. **username**: Progress dots -> emerald active with scale spring. Availability check -> emerald checkmark with scale or error shake. Continue -> GradientButton.
3. **interests**: Chips -> scale press + emerald border on selected + haptic.selection. Continue -> GradientButton.
4. **profile**: Avatar placeholder -> emerald dashed border. Continue -> GradientButton.
5. **suggested**: Follow buttons -> GradientButton size="sm". Skip -> ghost text.

Commit: `"feat(ui): polish auth and onboarding with branded inputs, GradientButton, animations"`

---

### Agent 21: Edit Profile + Story Viewer

**Files to MODIFY:**
- `apps/mobile/app/(screens)/edit-profile.tsx`
- `apps/mobile/app/(screens)/story-viewer.tsx`

1. **edit-profile**: Header -> GlassHeader. Save button -> GradientButton in header. Input fields -> emerald focus border. Cover/avatar pickers -> camera icon overlay.
2. **story-viewer**: Progress bars -> emerald fill. Reply input -> glass blur bar. Emoji reactions -> ensure float-up animation exists.

Commit: `"feat(ui): polish edit profile and story viewer with glass, emerald accents"`

---

## Phase 4: Tertiary Screens (Agents 22-26)

### Agent 22: User List Screens

**Files to MODIFY:**
- `apps/mobile/app/(screens)/followers/[userId].tsx`
- `apps/mobile/app/(screens)/following/[userId].tsx`
- `apps/mobile/app/(screens)/blocked.tsx`
- `apps/mobile/app/(screens)/muted.tsx`
- `apps/mobile/app/(screens)/circles.tsx`
- `apps/mobile/app/(screens)/close-friends.tsx`
- `apps/mobile/app/(screens)/mutual-followers.tsx`
- `apps/mobile/app/(screens)/follow-requests.tsx`

For ALL files:
1. Header -> GlassHeader (import from `@/components/ui/GlassHeader`)
2. User rows -> add press scale(0.98) via `useAnimatedPress` + haptic.selection
3. Follow buttons -> GradientButton (follow), GradientButton variant="secondary" (unfollow)
4. **blocked.tsx + muted.tsx** -- FIX: replace bare `ActivityIndicator` with `Skeleton.Circle` or appropriate skeleton
5. Empty states -> personality copy

Commit: `"feat(ui): polish all user list screens with GlassHeader, GradientButton, fix skeletons"`

---

### Agent 23: Messaging Sub-screens

**Files to MODIFY:**
- `apps/mobile/app/(screens)/new-conversation.tsx`
- `apps/mobile/app/(screens)/create-group.tsx`
- `apps/mobile/app/(screens)/conversation-info.tsx`
- `apps/mobile/app/(screens)/conversation-media.tsx`
- `apps/mobile/app/(screens)/pinned-messages.tsx`
- `apps/mobile/app/(screens)/starred-messages.tsx`

For ALL files:
1. Header -> GlassHeader
2. Contact/member rows -> press animation + haptic
3. **create-group**: member chips -> emerald bg. Create button -> GradientButton
4. **conversation-info**: settings rows -> card grouping (same as Agent 18 settings pattern)
5. **conversation-media**: grid items -> scale press
6. **pinned/starred**: message previews -> left emerald accent bar

Commit: `"feat(ui): polish messaging sub-screens with GlassHeader, press animations, card grouping"`

---

### Agent 24: Content Screens

**Files to MODIFY:**
- `apps/mobile/app/(screens)/hashtag/[tag].tsx`
- `apps/mobile/app/(screens)/saved.tsx`
- `apps/mobile/app/(screens)/drafts.tsx`
- `apps/mobile/app/(screens)/bookmark-folders.tsx`
- `apps/mobile/app/(screens)/archive.tsx`
- `apps/mobile/app/(screens)/watch-history.tsx`
- `apps/mobile/app/(screens)/community-posts.tsx`

For ALL files:
1. Header -> GlassHeader
2. Grid views -> scale press on items
3. **hashtag**: Large hashtag header with post count + GradientButton "Follow"
4. **saved.tsx** -- FIX: `filteredPosts`, `filteredThreads`, `filteredReels`, `filteredVideos` are undefined variables. They should reference the main data arrays, filtered by folderId if present. Read the file carefully and fix the logic.
5. **drafts**: swipe-to-delete rows
6. **bookmark-folders**: folder cards -> emerald accent
7. Empty states -> personality copy

Commit: `"feat(ui): polish content screens, fix saved.tsx undefined variables"`

---

### Agent 25: Media Detail Screens

**Files to MODIFY:**
- `apps/mobile/app/(screens)/video/[id].tsx`
- `apps/mobile/app/(screens)/reel/[id].tsx`
- `apps/mobile/app/(screens)/channel/[handle].tsx`
- `apps/mobile/app/(screens)/playlist/[id].tsx`
- `apps/mobile/app/(screens)/playlists/[channelId].tsx`
- `apps/mobile/app/(screens)/sound/[id].tsx`

For ALL files:
1. Header -> GlassHeader
2. Action buttons -> ActionButton with bounce + haptic
3. **channel**: subscribe button -> GradientButton
4. **playlist**: thumbnail grid -> rounded corners + shadow
5. **sound**: "Use this sound" -> GradientButton
6. Video player controls -> ensure glass overlay

Commit: `"feat(ui): polish media detail screens with GlassHeader, ActionButton, GradientButton"`

---

### Agent 26: Utility Screens

**Files to MODIFY:**
- `apps/mobile/app/(screens)/analytics.tsx`
- `apps/mobile/app/(screens)/content-settings.tsx`
- `apps/mobile/app/(screens)/manage-data.tsx`
- `apps/mobile/app/(screens)/blocked-keywords.tsx`
- `apps/mobile/app/(screens)/theme-settings.tsx`
- `apps/mobile/app/(screens)/qr-code.tsx`
- `apps/mobile/app/(screens)/qr-scanner.tsx`
- `apps/mobile/app/(screens)/share-profile.tsx`
- `apps/mobile/app/(screens)/report.tsx`
- `apps/mobile/app/(screens)/collab-requests.tsx`
- `apps/mobile/app/(screens)/go-live.tsx`
- `apps/mobile/app/(screens)/live/[id].tsx`
- `apps/mobile/app/(screens)/schedule-live.tsx`
- `apps/mobile/app/(screens)/call/[id].tsx`
- `apps/mobile/app/(screens)/broadcast-channels.tsx`
- `apps/mobile/app/(screens)/broadcast/[id].tsx`
- `apps/mobile/app/(screens)/create-broadcast.tsx`
- `apps/mobile/app/(screens)/voice-recorder.tsx`
- `apps/mobile/app/(screens)/reports/[id].tsx`
- `apps/mobile/app/(screens)/save-to-playlist.tsx`
- `apps/mobile/app/(screens)/account-settings.tsx`

For ALL files:
1. Header -> GlassHeader
2. Settings-style screens -> card grouping + press animations + haptic
3. **analytics**: chart bars -> emerald gradient fill
4. **qr-code**: emerald-themed frame
5. Primary action buttons -> GradientButton
6. Empty states -> personality copy
7. Fix any hardcoded fontFamily references to use fontWeight instead

Commit: `"feat(ui): polish all utility screens with GlassHeader, card grouping, GradientButton"`

---

## Dependency Graph

```
Phase 1 (Agents 1-5) -- MUST complete first
  |
  +-- Phase 2 (Agents 6-15) -- parallel after Phase 1
  +-- Phase 3 (Agents 16-21) -- parallel after Phase 1
  +-- Phase 4 (Agents 22-26) -- parallel after Phase 1
```

Within each phase, all agents are independent and can run in parallel.

## Verification

After all agents complete:
1. Run `cd apps/mobile && npx expo start` -- app should compile without errors
2. Verify no TypeScript errors: `npx tsc --noEmit`
3. Spot-check each tab screen visually
4. Verify all mandatory rules are still followed (no bare ActivityIndicator, no RN Modal, etc.)
