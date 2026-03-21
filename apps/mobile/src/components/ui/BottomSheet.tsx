import { useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { View, StyleSheet, Pressable, useWindowDimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, radius, spacing, animation } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoint?: number; // percentage of screen height (0-1), defaults to auto
  blurBackdrop?: boolean;
}

export function BottomSheet({ visible, onClose, children, snapPoint, blurBackdrop }: BottomSheetProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const maxHeight = snapPoint ? SCREEN_HEIGHT * snapPoint : undefined;

  const open = useCallback(() => {
    backdropOpacity.value = withTiming(1, { duration: animation.timing.normal });
    translateY.value = withSpring(0, animation.spring.responsive);
  }, [translateY, backdropOpacity]);

  const close = useCallback(() => {
    haptic.light();
    backdropOpacity.value = withTiming(0, { duration: animation.timing.fast });
    translateY.value = withSpring(SCREEN_HEIGHT, animation.spring.responsive);
    setTimeout(() => {
      if (mountedRef.current) {
        onClose();
      }
    }, 250);
  }, [haptic, translateY, backdropOpacity, onClose, SCREEN_HEIGHT]);

  useEffect(() => {
    if (visible) open();
    else {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
    }
  }, [visible, open, translateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      translateY.value = Math.max(0, newY);
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 500) {
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, animation.spring.responsive);
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

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, sheetStyle, maxHeight ? { maxHeight } : undefined]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(33, 40, 59, 0.92)', borderTopWidth: 0.5, borderTopColor: colors.glass.border }]} />
          )}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </GestureDetector>
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
  const haptic = useHaptic();
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.98 });

  const handlePress = () => {
    haptic.selection();
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
          destructive && styles.menuItemDestructive,
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
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
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
