import React, { useRef, useState, useCallback, memo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';
import { colors, spacing, radius, animation, glass } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Icon } from './Icon';

export interface ImageCarouselProps {
  images: string[]; // Array of image URIs
  texts?: string[]; // Per-slide text overlays (same length as images)
  height?: number; // Default 400
  showIndicators?: boolean; // Dot indicators, default true
  onImagePress?: (index: number) => void; // Opens gallery
  borderRadius?: number; // Default radius.lg
  blurred?: boolean; // Apply blur effect for sensitive content
}

export const ImageCarousel = memo(function ImageCarousel({
  images,
  texts,
  height = 400,
  showIndicators = true,
  onImagePress,
  borderRadius = radius.lg,
  blurred = false,
}: ImageCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const tc = useThemeColors();
  const flatListRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Handle scroll to update current index
  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    setCurrentIndex((prev) => (prev !== index ? index : prev));
  }, [screenWidth]);

  const goToIndex = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<string>) => {
    const slideText = texts?.[index];
    return (
      <Pressable
        style={[styles.imageWrapper, { width: screenWidth, height }]}
        onPress={() => onImagePress?.(index)}
        disabled={!onImagePress}
        accessibilityLabel={`Image ${index + 1} of ${images.length}${slideText ? `. ${slideText}` : ''}`}
        accessibilityRole="image"
      >
        <Image
          source={{ uri: item }}
          style={[styles.image, { borderRadius }, blurred && { opacity: 0.15 }]}
          contentFit="cover"
          transition={200}
          blurRadius={blurred ? 30 : 0}
        />
        {slideText ? (
          <View style={styles.textOverlay}>
            <View style={styles.textOverlayBg}>
              <Animated.Text style={styles.textOverlayText} numberOfLines={3}>
                {slideText}
              </Animated.Text>
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  }, [screenWidth, height, onImagePress, images.length, borderRadius, blurred, texts]);

  const scrollSnapInterval = screenWidth;


  if (images.length === 0) return null;

  return (
    <View style={[styles.container, { height }]}>
      {/* Image count badge top-right */}
      {images.length > 1 && (
        <View style={styles.countBadge}>
          <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.glassPill}>
            <Icon
              name="image"
              size="sm"
              color={colors.text.secondary}
              style={styles.countIcon}
            />
            <Animated.Text style={styles.countText}>
              {`${currentIndex + 1} / ${images.length}`}
            </Animated.Text>
          </BlurView>
        </View>
      )}

      {/* Horizontal carousel */}
      <FlatList
        ref={flatListRef}
        data={images}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        snapToInterval={scrollSnapInterval}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        initialNumToRender={3}
        maxToRenderPerBatch={5}
        windowSize={5}
      />

      {/* Dot indicators */}
      {showIndicators && images.length > 1 && (
        <View style={styles.indicatorsContainer}>
          {images.map((_, index) => (
            <Pressable
              key={index}
              style={[styles.dotBase, { backgroundColor: tc.surface }, index === currentIndex && styles.dotActive]}
              onPress={() => goToIndex(index)}
              hitSlop={18}
              accessibilityLabel={`Go to image ${index + 1}`}
              accessibilityRole="button"
            />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  imageWrapper: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  countBadge: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    zIndex: 10,
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: glass.medium.borderWidth,
    borderColor: glass.medium.borderColor,
    overflow: 'hidden',
  },
  countIcon: {
    marginEnd: spacing.xs,
  },
  countText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  indicatorsContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dotBase: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  dotActive: {
    backgroundColor: colors.emerald,
    width: 24,
  },
  textOverlay: {
    position: 'absolute',
    bottom: 60,
    start: spacing.lg,
    end: spacing.lg,
    alignItems: 'center',
  },
  textOverlayBg: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    maxWidth: '80%',
  },
  textOverlayText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DMSans_500Medium',
    textAlign: 'center',
    lineHeight: 22,
  },
});