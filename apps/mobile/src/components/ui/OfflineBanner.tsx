import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useStore } from '@/store';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize } from '@/theme';

const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const isOffline = useStore((s) => s.isOffline);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOffline ? 1 : 0, { duration: 300 });
  }, [isOffline, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, BANNER_HEIGHT], Extrapolation.CLAMP),
    opacity: progress.value,
    overflow: 'hidden' as const,
  }));

  return (
    <Animated.View style={[styles.banner, animatedStyle]}>
      <Icon name="globe" size="xs" color={colors.text.primary} />
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  text: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
