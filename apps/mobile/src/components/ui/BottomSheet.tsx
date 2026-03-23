import { useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { View, StyleSheet, Pressable, Platform, useWindowDimensions, KeyboardAvoidingView, AccessibilityInfo, ScrollView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, radius, spacing, animation } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Percentage of screen height (0-1). Must be between 0.1 and 1.0. Values outside range are clamped. */
  snapPoint?: number;
  blurBackdrop?: boolean;
  /** When true, wraps children in a ScrollView for long/keyboard-heavy content. Default: false */
  scrollable?: boolean;
}

export function BottomSheet({ visible, onClose, children, snapPoint, blurBackdrop, scrollable = false }: BottomSheetProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const mountedRef = useRef(true);
  const handleScale = useSharedValue(1);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subtle breathing pulse on the drag handle to signal draggability
  useEffect(() => {
    if (visible) {
      handleScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1200 }),
          withTiming(1, { duration: 1200 })
        ),
        3, // pulse 3 times then stop
        true
      );
    } else {
      handleScale.value = 1;
    }
  }, [visible, handleScale]);

  const handleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: handleScale.value }],
  }));

  // Validate and clamp snapPoint to 0.1-1 range (percentage of screen height)
  if (__DEV__ && snapPoint !== undefined && (snapPoint < 0 || snapPoint > 1)) {
    console.warn(`BottomSheet: snapPoint should be 0-1 (got ${snapPoint}), clamping to valid range`);
  }
  const clampedSnap = snapPoint ? Math.min(Math.max(snapPoint, 0.1), 1) : undefined;
  const maxHeight = clampedSnap ? SCREEN_HEIGHT * clampedSnap : undefined;

  const open = useCallback(() => {
    backdropOpacity.value = withTiming(1, { duration: animation.timing.normal });
    // Premium entrance spring: heavier and more damped than default responsive
    translateY.value = withSpring(0, { damping: 25, stiffness: 200, mass: 0.8 });
    // Announce to screen readers that a menu has opened
    AccessibilityInfo.announceForAccessibility(t('common.menuOpened') || 'Menu opened');
  }, [translateY, backdropOpacity, t]);

  const close = useCallback(() => {
    if (!mountedRef.current) return;
    haptic.navigate();
    backdropOpacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  }, [haptic, translateY, backdropOpacity, onClose, SCREEN_HEIGHT]);

  useEffect(() => {
    if (visible) open();
    else {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
    }
  }, [visible, open, translateY, backdropOpacity]);

  // Close sheet on Android hardware back button
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      if (newY < 0) {
        // Rubberband effect when dragging up past top
        translateY.value = newY * 0.3;
      } else {
        translateY.value = newY;
      }
      // Fade backdrop proportionally as sheet is dragged down
      backdropOpacity.value = interpolate(
        translateY.value,
        [0, SCREEN_HEIGHT * 0.3],
        [1, 0],
        'clamp'
      );
    })
    .onEnd((event) => {
      if (event.translationY > 60 || event.velocityY > 800) {
        runOnJS(close)();
      } else {
        // Snap back with premium spring
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        {blurBackdrop ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.backdrop} />
        )}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, sheetStyle, maxHeight ? { maxHeight } : undefined, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} accessibilityViewIsModal={true}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(33, 40, 59, 0.92)', borderTopWidth: 0.5, borderTopColor: colors.glass.border }]} />
            )}
            <View style={styles.handleContainer}>
              <Animated.View style={[styles.handle, { backgroundColor: tc.borderLight }, handleAnimatedStyle]} />
            </View>
            <View style={styles.content}>
              {scrollable ? (
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              ) : (
                children
              )}
            </View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}

// Convenience component for menu items inside BottomSheet
export const BottomSheetItem = memo(function BottomSheetItem({ label, icon, onPress, destructive, disabled }: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.98 });

  const handlePress = () => {
    haptic.tick();
    onPress();
  };

  return (
    <AnimatedPressable
      style={[
        styles.menuItem,
        animatedStyle,
        disabled && styles.menuItemDisabled,
      ]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={handlePress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {icon}
      <Animated.Text
        style={[
          styles.menuItemText,
          { color: destructive ? colors.error : tc.text.primary },
        ]}
      >
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardAvoid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    position: 'relative',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    paddingBottom: spacing.lg, // Overridden by inline style with safe area insets
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  // TODO: colors.dark.borderLight overridden by inline style with tc.borderLight from useThemeColors()
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dark.borderLight,
  },
  content: {
    paddingTop: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuItemText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  menuItemDestructive: {
    color: colors.error,
  },
});
