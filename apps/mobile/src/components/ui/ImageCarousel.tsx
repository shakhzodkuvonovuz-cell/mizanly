import React, { useRef, useState } from 'react';
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
import { Icon } from './Icon';

export interface ImageCarouselProps {
  images: string[]; // Array of image URIs
  height?: number; // Default 400
  showIndicators?: boolean; // Dot indicators, default true
  onImagePress?: (index: number) => void; // Opens gallery
  borderRadius?: number; // Default radius.lg
}

export function ImageCarousel({
  images,
  height = 400,
  showIndicators = true,
  onImagePress,
  borderRadius = radius.lg,
}: ImageCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Handle scroll to update current index
  const onScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const goToIndex = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<string>) => (
    <Pressable
      style={[styles.imageWrapper, { width: screenWidth, height }]}
      onPress={() => onImagePress?.(index)}
      disabled={!onImagePress}
    >
      <Image
        source={{ uri: item }}
        style={[styles.image, { borderRadius }]}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  );

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
              style={[styles.dotBase, index === currentIndex && styles.dotActive]}
              onPress={() => goToIndex(index)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

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
    right: spacing.md,
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
    marginRight: spacing.xs,
  },
  countText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  indicatorsContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: 0,
    right: 0,
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
});