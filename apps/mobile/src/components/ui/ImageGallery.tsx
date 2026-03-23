import React, { useCallback, useRef, useState, useMemo, useEffect, memo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Share,
  FlatList,
  ViewToken,
  ViewabilityConfig,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, spacing, radius, animation, glass } from '@/theme';
import { Icon } from './Icon';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';

export interface ImageGalleryProps {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export const ImageGallery = memo(function ImageGallery({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: ImageGalleryProps) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<string>>(null);

  // Press animations for buttons
  const closePress = useAnimatedPress({ scaleTo: 0.85 });
  const sharePress = useAnimatedPress({ scaleTo: 0.85 });

  // Dismiss translateY animation (swipe down)
  const dismissY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  // Entrance animation values
  const entranceProgress = useSharedValue(0);

  // Per-image scale and translation values for pinch-to-zoom
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

  // Sync initial index when visible changes
  useEffect(() => {
    if (visible) {
      StatusBar.setHidden(true, 'fade');
      setCurrentIndex(initialIndex);
      flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      resetImageState();
      dismissY.value = 0;
      backdropOpacity.value = 1;
      // Animate entrance
      entranceProgress.value = withSpring(1, animation.spring.gentle);
    } else {
      StatusBar.setHidden(false, 'fade');
      entranceProgress.value = 0;
    }
  }, [visible, initialIndex, resetImageState, dismissY, backdropOpacity, entranceProgress]);

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

  // Pinch gesture for zoom (1x - 4x)
  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Limit scale between 1 and 4
      if (scale.value < 1) {
        scale.value = withSpring(1, animation.spring.responsive);
        savedScale.value = 1;
        translateX.value = withSpring(0, animation.spring.responsive);
        translateY.value = withSpring(0, animation.spring.responsive);
        savedTranslate.value = { x: 0, y: 0 };
      } else if (scale.value > 4) {
        scale.value = withSpring(4, animation.spring.responsive);
        savedScale.value = 4;
      }
    }), [scale, savedScale, translateX, translateY, savedTranslate]);

  // Pan gesture for moving zoomed image
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

  // Double-tap gesture to toggle 1x ↔ 2x
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

  const dismissAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Entrance animation (FadeInUp)
  const entranceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [
      {
        translateY: interpolate(
          entranceProgress.value,
          [0, 1],
          [30, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const shareImage = useCallback(async () => {
    try {
      await Share.share({
        url: images[currentIndex],
        message: images[currentIndex],
      });
    } catch (error) {
      if (__DEV__) console.error('Error sharing image:', error);
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

      {/* Close button (top-left) */}
      <Animated.View style={[styles.closeButton, closePress.animatedStyle, entranceAnimatedStyle]}>
        <Pressable
          style={styles.glassButton}
          onPress={onClose}
          onPressIn={closePress.onPressIn}
          onPressOut={closePress.onPressOut}
          hitSlop={16}
        >
          <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.glassButtonInner}>
            <Icon name="x" size="md" color={colors.text.primary} />
          </BlurView>
        </Pressable>
      </Animated.View>

      {/* Share button (top-right) */}
      <Animated.View style={[styles.shareButton, sharePress.animatedStyle, entranceAnimatedStyle]}>
        <Pressable
          style={styles.glassButton}
          onPress={shareImage}
          onPressIn={sharePress.onPressIn}
          onPressOut={sharePress.onPressOut}
          hitSlop={16}
        >
          <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.glassButtonInner}>
            <Icon name="share" size="md" color={colors.text.primary} />
          </BlurView>
        </Pressable>
      </Animated.View>

      {/* Image counter (top-center) */}
      <Animated.View style={[styles.counterContainer, entranceAnimatedStyle]}>
        <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.glassPill}>
          <Icon name="image" size="sm" color={colors.text.secondary} style={styles.counterIcon} />
          <Animated.Text style={styles.counterText}>
            {`${currentIndex + 1} / ${images.length}`}
          </Animated.Text>
        </BlurView>
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
    start: spacing.xl,
    zIndex: 10,
  },
  shareButton: {
    position: 'absolute',
    top: spacing.xl + 8,
    end: spacing.xl,
    zIndex: 10,
  },
  glassButton: {
    width: 44,
    height: 44,
  },
  glassButtonInner: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  counterContainer: {
    position: 'absolute',
    top: spacing.xl + 8,
    start: 0,
    end: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: glass.medium.borderWidth,
    borderColor: glass.medium.borderColor,
    overflow: 'hidden',
  },
  counterIcon: {
    marginEnd: spacing.xs,
  },
  counterText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.text.secondary,
    letterSpacing: 0.5,
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
});