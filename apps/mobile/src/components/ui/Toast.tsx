import { useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/ui/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useStore } from '@/store';
import { colors, spacing, radius, fontSize, fonts, animation } from '@/theme';
import type { IconName } from '@/components/ui/Icon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ShowToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

// ---------------------------------------------------------------------------
// Variant configuration
// ---------------------------------------------------------------------------

const VARIANT_CONFIG: Record<ToastVariant, { color: string; icon: IconName }> = {
  success: { color: colors.emerald, icon: 'check-circle' },
  error: { color: colors.error, icon: 'slash' },
  warning: { color: colors.gold, icon: 'bell' },
  info: { color: colors.info, icon: 'globe' },
};

const DEFAULT_DURATION = 3000;
const SWIPE_DISMISS_THRESHOLD = 60;

// ---------------------------------------------------------------------------
// showToast — callable from anywhere (outside React components)
// ---------------------------------------------------------------------------

let toastId = 0;

export function showToast(options: ShowToastOptions): void {
  const id = `toast-${++toastId}`;
  useStore.getState().addToast({
    id,
    message: options.message,
    variant: options.variant,
    duration: options.duration,
    action: options.action,
  });
}

// ---------------------------------------------------------------------------
// ToastItem — individual animated toast card
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: ToastData;
  index: number;
}

function ToastItem({ toast, index }: ToastItemProps) {
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const dismissToast = useStore((s) => s.dismissToast);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDismissed = useRef(false);

  const config = VARIANT_CONFIG[toast.variant];
  const duration = toast.duration ?? DEFAULT_DURATION;

  // Shared values for animation
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const progressWidth = useSharedValue(1); // 1 = full, 0 = empty

  const dismiss = useCallback(() => {
    if (isDismissed.current) return;
    isDismissed.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (reducedMotion) {
      dismissToast(toast.id);
      return;
    }

    translateY.value = withTiming(100, { duration: animation.timing.normal });
    opacity.value = withTiming(0, { duration: animation.timing.normal });

    // Remove from store after exit animation completes
    setTimeout(() => {
      dismissToast(toast.id);
    }, animation.timing.normal);
  }, [toast.id, dismissToast, reducedMotion, translateY, opacity]);

  // Entrance animation + haptic feedback
  useEffect(() => {
    // Haptic feedback on show
    if (toast.variant === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (toast.variant === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      progressWidth.value = 0;
    } else {
      translateY.value = withSpring(0, { damping: 20, stiffness: 90 });
      opacity.value = withTiming(1, { duration: animation.timing.fast });
      progressWidth.value = withTiming(0, { duration });
    }

    // Auto-dismiss timer
    timerRef.current = setTimeout(() => {
      runOnJS(dismiss)();
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe-to-dismiss gesture
  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationY > SWIPE_DISMISS_THRESHOLD) {
        runOnJS(dismiss)();
      } else {
        // Snap back
        translateY.value = withSpring(0, { damping: 20, stiffness: 90 });
      }
    })
    .onChange((event) => {
      // Only allow downward swipe
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    });

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%` as `${number}%`,
  }));

  const bottomOffset = insets.bottom + spacing.base + index * (68 + spacing.sm);

  // Background for Android fallback (no BlurView)
  const androidBg = tc.isDark
    ? 'rgba(33, 40, 59, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';

  const cardContent = (
    <View style={styles.cardInner}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: config.color }]} />

      {/* Icon */}
      <View style={styles.iconContainer}>
        <Icon name={config.icon} size="sm" color={config.color} />
      </View>

      {/* Message + action */}
      <View style={styles.contentContainer}>
        <Text
          style={[styles.message, { color: tc.text.primary, fontFamily: fonts.bodyMedium }]}
          numberOfLines={2}
        >
          {toast.message}
        </Text>
        {toast.action && (
          <Pressable
            onPress={() => {
              toast.action?.onPress();
              dismiss();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
          >
            <Text style={[styles.actionLabel, { color: config.color, fontFamily: fonts.bodyBold }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Close button */}
      <Pressable
        onPress={dismiss}
        hitSlop={8}
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Icon name="x" size="xs" color={tc.text.tertiary} />
      </Pressable>
    </View>
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.toastContainer,
          { bottom: bottomOffset },
          containerAnimatedStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={toast.message}
      >
        <View style={[styles.card, { borderColor: tc.isDark ? colors.glass.border : tc.border }]}>
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={40}
              tint={tc.isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: androidBg }]} />
          )}

          {cardContent}

          {/* Progress bar */}
          <Animated.View
            style={[
              styles.progressBar,
              { backgroundColor: config.color },
              progressAnimatedStyle,
            ]}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer — mount once in root layout
// ---------------------------------------------------------------------------

export function ToastContainer(): JSX.Element | null {
  const toasts = useStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      {toasts.map((toast, index) => (
        <ToastItem key={toast.id} toast={toast} index={index} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    start: spacing.base,
    end: spacing.base,
    zIndex: 99999,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    // Elevation shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 16,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingEnd: spacing.md,
    minHeight: 52,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  iconContainer: {
    marginStart: spacing.md,
    marginEnd: spacing.sm,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  closeButton: {
    marginStart: spacing.sm,
    padding: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    height: 2,
    position: 'absolute',
    bottom: 0,
    start: 0,
    borderRadius: 1,
  },
});
