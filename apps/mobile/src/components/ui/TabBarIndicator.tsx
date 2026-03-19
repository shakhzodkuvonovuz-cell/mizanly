import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, animation } from '@/theme';

interface TabBarIndicatorProps {
  /** Number of tabs */
  tabCount: number;
  /** Currently active tab index (0-based) */
  activeIndex: number;
  /** Width of the tab bar */
  containerWidth: number;
  /** Color of the indicator */
  color?: string;
}

/**
 * Animated sliding indicator under the active tab.
 * Provides smooth spring animation when switching tabs.
 */
export const TabBarIndicator = memo(function TabBarIndicator({
  tabCount,
  activeIndex,
  containerWidth,
  color = colors.emerald,
}: TabBarIndicatorProps) {
  const indicatorWidth = containerWidth / tabCount;
  const translateX = useSharedValue(activeIndex * indicatorWidth);

  useEffect(() => {
    translateX.value = withSpring(activeIndex * indicatorWidth, animation.spring.snappy);
  }, [activeIndex, indicatorWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.track, { width: containerWidth }]}>
      <Animated.View
        style={[
          styles.indicator,
          { width: indicatorWidth * 0.4, backgroundColor: color },
          indicatorStyle,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: 3,
    position: 'relative',
  },
  indicator: {
    height: 3,
    borderRadius: 1.5,
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
