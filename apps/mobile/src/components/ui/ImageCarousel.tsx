import React, { useRef, useState, useCallback, memo, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from './ProgressiveImage';
import { imagePresets } from '@/utils/image';
import Animated from 'react-native-reanimated';
import { colors, spacing, radius, fonts, fontSize, fontSizeExt, glass } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Icon } from './Icon';

export interface ImageCarouselProps {
  images: string[];
  texts?: string[];
  height?: number;
  showIndicators?: boolean;
  onImagePress?: (index: number) => void;
  borderRadius?: number;
  blurred?: boolean;
}

// ── Instagram-style dot indicator: max 5 visible, outer dots shrink ──
const MAX_VISIBLE_DOTS = 5;

function DotIndicator({ total, current, onDotPress }: {
  total: number;
  current: number;
  onDotPress: (i: number) => void;
}) {
  const tc = useThemeColors();

  // For <= MAX_VISIBLE_DOTS, show all. For more, show a sliding window.
  const dots = useMemo(() => {
    if (total <= MAX_VISIBLE_DOTS) {
      return Array.from({ length: total }, (_, i) => i);
    }
    // Sliding window centered on current
    const half = Math.floor(MAX_VISIBLE_DOTS / 2);
    let start = current - half;
    let end = current + half;

    if (start < 0) { start = 0; end = MAX_VISIBLE_DOTS - 1; }
    if (end >= total) { end = total - 1; start = total - MAX_VISIBLE_DOTS; }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [total, current]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dotIndex) => {
        const isActive = dotIndex === current;
        // Distance from current: used to scale edge dots
        const dist = Math.abs(dotIndex - current);
        const isEdge = total > MAX_VISIBLE_DOTS && (dotIndex === dots[0] || dotIndex === dots[dots.length - 1]) && dist > 1;
        const dotScale = isEdge ? 0.6 : 1;

        return (
          <Pressable
            key={dotIndex}
            onPress={() => onDotPress(dotIndex)}
            hitSlop={14}
            accessibilityLabel={`Slide ${dotIndex + 1}`}
            accessibilityRole="button"
            style={[
              styles.dot,
              {
                backgroundColor: isActive ? colors.emerald : tc.surface,
                width: isActive ? 20 : 7,
                height: 7,
                transform: [{ scale: dotScale }],
                opacity: isEdge ? 0.5 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
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

  // Track last prefetch to avoid redundant calls
  const lastPrefetchRef = useRef(-1);

  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    setCurrentIndex((prev) => (prev !== index ? index : prev));

    // Prefetch adjacent network images (skip local file:// URIs)
    if (index !== lastPrefetchRef.current && images.length > 1) {
      lastPrefetchRef.current = index;
      [index + 1, index + 2]
        .filter((i) => i < images.length && images[i]?.startsWith('http'))
        .forEach((i) => { Image.prefetch(imagePresets.feedImage(images[i])); });
    }
  }, [screenWidth, images]);

  const goToIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

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
        <ProgressiveImage
          uri={item}
          width={screenWidth}
          height={height}
          borderRadius={borderRadius}
          contentFit="cover"
          transition={200}
          style={blurred ? { opacity: 0.15 } : undefined}
        />
        {/* Per-slide text overlay — positioned above dots */}
        {slideText ? (
          <View style={styles.textOverlay}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.textGradient}
            />
            <View style={styles.textContent}>
              <Text style={styles.textOverlayText} numberOfLines={3}>
                {slideText}
              </Text>
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  }, [screenWidth, height, onImagePress, images.length, borderRadius, blurred, texts]);

  if (images.length === 0) return null;

  return (
    <View style={[styles.container, { height }]}>
      {/* Count badge top-right */}
      {images.length > 1 && (
        <View style={styles.countBadge}>
          <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={styles.glassPill}>
            <Icon name="layers" size="xs" color={colors.text.secondary} style={styles.countIcon} />
            <Text style={styles.countText}>
              {`${currentIndex + 1} / ${images.length}`}
            </Text>
          </BlurView>
        </View>
      )}

      {/* Horizontal scroll */}
      <FlatList
        ref={flatListRef}
        data={images}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        snapToInterval={screenWidth}
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

      {/* Animated dot indicators */}
      {showIndicators && images.length > 1 && (
        <DotIndicator total={images.length} current={currentIndex} onDotPress={goToIndex} />
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
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },

  // ── Dot indicators ──
  dotsRow: {
    position: 'absolute',
    bottom: spacing.base,
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    borderRadius: radius.full,
  },

  // ── Text overlay ──
  textOverlay: {
    position: 'absolute',
    bottom: 44, // Above dot indicators (base 16 + dot height + gap)
    start: 0,
    end: 0,
  },
  textGradient: {
    position: 'absolute',
    bottom: -44,
    start: 0,
    end: 0,
    height: 120,
  },
  textContent: {
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  textOverlayText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
