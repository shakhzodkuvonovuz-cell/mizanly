import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

interface ScrollLinkedHeaderResult {
  /** Attach to FlashList/FlatList/ScrollView onScroll */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** Apply to the header Animated.View */
  headerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** Apply to the title text for fade-out */
  titleAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** Shared value for blur intensity (0-60), can drive BlurView intensity */
  blurIntensity: Animated.SharedValue<number>;
  /** Current scroll position */
  scrollY: Animated.SharedValue<number>;
}

/**
 * Scroll-linked header with elastic collapse and progressive blur.
 * Replaces the basic show/hide pattern with a proportional, cinematic collapse.
 *
 * Usage:
 *   const { onScroll, headerAnimatedStyle, titleAnimatedStyle, blurIntensity } = useScrollLinkedHeader(56);
 *
 *   <Animated.View style={[styles.header, headerAnimatedStyle]}>
 *     <BlurView intensity={blurIntensity} ...>
 *       <Animated.Text style={[styles.title, titleAnimatedStyle]}>Title</Animated.Text>
 *     </BlurView>
 *   </Animated.View>
 *
 *   <FlashList onScroll={onScroll} ... />
 *
 * @param headerHeight - Height of the header in px (default: 56)
 */
export function useScrollLinkedHeader(headerHeight: number = 56): ScrollLinkedHeaderResult {
  const scrollY = useSharedValue(0);
  const blurIntensity = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      // Blur increases as content scrolls under header
      blurIntensity.value = interpolate(
        event.contentOffset.y,
        [0, headerHeight / 2],
        [0, 60],
        Extrapolation.CLAMP
      );
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, headerHeight],
      [0, -headerHeight],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }],
    };
  });

  const titleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, headerHeight * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return {
    onScroll,
    headerAnimatedStyle,
    titleAnimatedStyle,
    blurIntensity,
    scrollY,
  };
}
