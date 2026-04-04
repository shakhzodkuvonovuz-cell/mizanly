import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

interface PremiumToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
}

export function PremiumToggle({ value, onValueChange }: PremiumToggleProps) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const haptic = useContextualHaptic();
  const translateX = useSharedValue(value ? 20 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withSpring(value ? 20 : 0, { damping: 15, stiffness: 200 });
  }, [value]);

  const handlePress = () => {
    haptic.tick();
    scale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    onValueChange(!value);
  };

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
    >
      <LinearGradient
        colors={value ? [colors.emerald, colors.extended.greenDark] : [tc.border, tc.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.toggleTrack}
      >
        <Animated.View style={[styles.toggleThumb, thumbStyle]}>
          {value && (
            <LinearGradient
              colors={['#fff', '#f0f0f0']}
              style={styles.toggleThumbGradient}
            />
          )}
        </Animated.View>
      </LinearGradient>
    </Pressable>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: radius.lg,
    padding: 4,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  toggleThumbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
});
