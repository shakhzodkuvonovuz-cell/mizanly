import { useCallback, useRef, useState, useMemo, useEffect, memo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Share,
  FlatList,
  ViewToken,
  ViewabilityConfig,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon } from './Icon';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, radius, animation } from '@/theme';

export interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageLightbox = memo(function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<string>>(null);

  // Close/share button press animations
  const closePress = useAnimatedPress({ scaleTo: 0.85 });
  const sharePress = useAnimatedPress({ scaleTo: 0.85 });

  // Dismiss translateY animation
  const dismissY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  const dismissAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Per-image scale and translation values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslate = useSharedValue({ x: 0, y: 0 });

  const resetImageState = useCallback(() => {
    scale.value = withSpring(1, animation.spring.responsive);
    translateX.value = withSpring(0, animation.spring.responsive);
    translateY.value = withSpring(0, animation.spring.responsive);
    savedScale.value = 1;
    savedTranslate.value = { x: 0, y: 0 };
  }, [scale, translateX, translateY, savedScale, savedTranslate]);

  // Vertical swipe-to-dismiss gesture (only when not zoomed)
  const verticalDismissGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-20, 20])
    .failOffsetX([-10, 10])
    .onUpdate((event) => {
      if (scale.value <= 1) {
        dismissY.value = event.translationY;
        backdropOpacity.value = Math.max(0.3, 1 - Math.abs(event.translationY) / (SCREEN_HEIGHT * 0.4));
      }
    })
    .onEnd((event) => {
      if (scale.value <= 1 && Math.abs(event.translationY) > 150) {
        // Dismiss
        const direction = event.translationY > 0 ? 1 : -1;
        dismissY.value = withSpring(direction * SCREEN_HEIGHT, animation.spring.snappy);
        backdropOpacity.value = withSpring(0, animation.spring.snappy);
        // Use runOnJS to call onClose after animation
        runOnJS(onClose)();
      } else {
        // Snap back
        dismissY.value = withSpring(0, animation.spring.responsive);
        backdropOpacity.value = withSpring(1, animation.spring.responsive);
      }
    }), [scale, dismissY, backdropOpacity, SCREEN_HEIGHT, onClose]);

  // Sync initial index when visible changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      resetImageState();
      dismissY.value = 0;
      backdropOpacity.value = 1;
    }
  }, [visible, initialIndex, resetImageState, dismissY, backdropOpacity]);

  // Reset when switching images
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index ?? 0;
      setCurrentIndex(index);
      resetImageState();
    }
  }).current;

  const viewabilityConfig: ViewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Limit scale between 1 and 3
      if (scale.value < 1) {
        scale.value = withSpring(1, animation.spring.responsive);
        savedScale.value = 1;
      } else if (scale.value > 3) {
        scale.value = withSpring(3, animation.spring.responsive);
        savedScale.value = 3;
      }
    }), [scale, savedScale]);

  const panGesture = useMemo(() => Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslate.value.x + event.translationX;
      translateY.value = savedTranslate.value.y + event.translationY;
    })
    .onEnd(() => {
      savedTranslate.value = { x: translateX.value, y: translateY.value };
      // Apply bounds based on scale
      const maxTranslateX = (scale.value - 1) * SCREEN_WIDTH / 2;
      const maxTranslateY = (scale.value - 1) * SCREEN_HEIGHT / 2;
      if (Math.abs(translateX.value) > maxTranslateX) {
        translateX.value = withSpring(Math.sign(translateX.value) * maxTranslateX, animation.spring.responsive);
        savedTranslate.value.x = translateX.value;
      }
      if (Math.abs(translateY.value) > maxTranslateY) {
        translateY.value = withSpring(Math.sign(translateY.value) * maxTranslateY, animation.spring.responsive);
        savedTranslate.value.y = translateY.value;
      }
    }), [translateX, translateY, savedTranslate, scale, SCREEN_WIDTH, SCREEN_HEIGHT]);

  const doubleTapGesture = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value === 1) {
        scale.value = withSpring(2, animation.spring.responsive);
        savedScale.value = 2;
      } else {
        scale.value = withSpring(1, animation.spring.responsive);
        savedScale.value = 1;
        translateX.value = withSpring(0, animation.spring.responsive);
        translateY.value = withSpring(0, animation.spring.responsive);
        savedTranslate.value = { x: 0, y: 0 };
      }
    }), [scale, savedScale, translateX, translateY, savedTranslate]);

  // Compose gestures: double-tap should be recognized before pan/pinch
  const composedGesture = useMemo(() =>
    Gesture.Exclusive(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture)),
    [doubleTapGesture, pinchGesture, panGesture]
  );

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as const,
  }));

  const shareImage = useCallback(async () => {
    try {
      await Share.share({
        url: images[currentIndex],
        message: images[currentIndex],
      });
    } catch (error) {
      console.error('Error sharing image:', error);
    }
  }, [images, currentIndex]);

  const goToIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  if (!visible || images.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dark backdrop */}
      <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />

      {/* Close button */}
      <Animated.View style={[styles.closeButton, closePress.animatedStyle]}>
        <Pressable
          style={styles.buttonInner}
          onPress={onClose}
          onPressIn={closePress.onPressIn}
          onPressOut={closePress.onPressOut}
          hitSlop={16}
        >
          <Icon name="x" size="lg" color={colors.text.primary} />
        </Pressable>
      </Animated.View>

      {/* Share button */}
      <Animated.View style={[styles.shareButton, sharePress.animatedStyle]}>
        <Pressable
          style={styles.buttonInner}
          onPress={shareImage}
          onPressIn={sharePress.onPressIn}
          onPressOut={sharePress.onPressOut}
          hitSlop={16}
        >
          <Icon name="share" size="lg" color={colors.text.primary} />
        </Pressable>
      </Animated.View>

      {/* Image carousel with swipe-to-dismiss */}
      <GestureDetector gesture={verticalDismissGesture}>
        <Animated.View style={[StyleSheet.absoluteFill, dismissAnimatedStyle]}>
          <FlatList
            removeClippedSubviews={true}
            ref={flatListRef}
            data={images}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => (
              <View style={[styles.imageContainer, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}>
                <GestureDetector gesture={composedGesture}>
                  <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
                    <Image
                      source={{ uri: item }}
                      style={styles.image}
                      contentFit="contain"
                      transition={200}
                    />
                  </Animated.View>
                </GestureDetector>
              </View>
            )}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />

          {/* Page indicator dots */}
          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, index) => (
                <Pressable
                  key={index}
                  style={[styles.dot, index === currentIndex && styles.dotActive]}
                  onPress={() => goToIndex(index)}
                />
              ))}
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl + 8,
    right: spacing.xl,
    zIndex: 10,
    width: 44,
    height: 44,
  },
  shareButton: {
    position: 'absolute',
    top: spacing.xl + 8,
    left: spacing.xl,
    zIndex: 10,
    width: 44,
    height: 44,
  },
  buttonInner: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: spacing.xl + 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  dotActive: {
    backgroundColor: colors.text.primary,
    width: 24,
  },
});