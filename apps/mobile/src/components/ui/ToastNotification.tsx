import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, fontSize, glass, radius, shadow, spacing } from '@/theme';

interface ToastNotificationProps {
  visible: boolean;
  message: string;
  icon?: React.ReactNode;
  duration?: number;
  onDismiss: () => void;
}

export function ToastNotification({
  visible,
  message,
  icon,
  duration = 2500,
  onDismiss,
}: ToastNotificationProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShowingRef = useRef(false);

  useEffect(() => {
    if (visible && !isShowingRef.current) {
      isShowingRef.current = true;

      // Slide in
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
        mass: 0.5,
      });
      opacity.value = withTiming(1, { duration: 200 });

      // Schedule dismiss
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        translateY.value = withSpring(-100, {
          damping: 15,
          stiffness: 150,
          mass: 0.5,
        });
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
          if (finished) {
            runOnJS(onDismiss)();
          }
        });
        isShowingRef.current = false;
      }, duration);
    } else if (!visible && isShowingRef.current) {
      // Force dismiss
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      translateY.value = withSpring(-100, {
        damping: 15,
        stiffness: 150,
        mass: 0.5,
      });
      opacity.value = withTiming(0, { duration: 200 });
      isShowingRef.current = false;
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible && !isShowingRef.current) return null;

  const content = (
    <View style={styles.inner}>
      {icon && <View style={styles.iconWrapper}>{icon}</View>}
      <Animated.Text style={styles.message} numberOfLines={2}>
        {message}
      </Animated.Text>
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={glass.medium.blurIntensity}
          tint="dark"
          style={styles.blurContainer}
        >
          <View style={styles.glassOverlay}>{content}</View>
        </BlurView>
      ) : (
        <View style={styles.androidContainer}>{content}</View>
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
  blurContainer: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: glass.medium.borderWidth,
    borderColor: glass.medium.borderColor,
  },
  glassOverlay: {
    backgroundColor: glass.medium.overlayColor,
  },
  androidContainer: {
    backgroundColor: 'rgba(33, 40, 59, 0.95)',
    borderRadius: radius.lg,
    borderWidth: glass.medium.borderWidth,
    borderColor: glass.medium.borderColor,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  message: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: fontSize.sm * 1.5,
  },
});
