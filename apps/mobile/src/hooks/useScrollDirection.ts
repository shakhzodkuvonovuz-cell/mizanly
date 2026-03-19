import { useCallback, useRef } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Hook for hide-on-scroll-down, reveal-on-scroll-up pattern.
 * Returns animated styles for header and tab bar.
 */
export function useScrollDirection(headerHeight = 56, tabBarHeight = 80) {
  const scrollY = useRef(0);
  const headerTranslateY = useSharedValue(0);
  const tabBarTranslateY = useSharedValue(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentY = event.nativeEvent.contentOffset.y;
      const diff = currentY - scrollY.current;

      if (currentY <= 0) {
        // At top — always show
        headerTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        tabBarTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      } else if (diff > 5) {
        // Scrolling down — hide
        headerTranslateY.value = withTiming(-headerHeight, { duration: 200 });
        tabBarTranslateY.value = withTiming(tabBarHeight, { duration: 200 });
      } else if (diff < -5) {
        // Scrolling up — reveal
        headerTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        tabBarTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }

      scrollY.current = currentY;
    },
    [headerHeight, tabBarHeight, headerTranslateY, tabBarTranslateY],
  );

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const tabBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarTranslateY.value }],
  }));

  return { onScroll, headerAnimatedStyle, tabBarAnimatedStyle };
}
