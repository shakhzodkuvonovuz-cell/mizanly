import { memo } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { BLURHASH_POST } from '@/utils/blurhash';

interface ProgressiveImageProps {
  /** Image URI */
  uri: string;
  /** Blurhash string from API. Falls back to default post blurhash. Pass null to disable placeholder. */
  blurhash?: string | null;
  /** Width — number for fixed, '100%' for fluid */
  width: number | '100%';
  /** Height in pixels */
  height: number;
  /** Border radius (default: 0) */
  borderRadius?: number;
  /** Content fit mode (default: 'cover') */
  contentFit?: 'cover' | 'contain' | 'fill';
  /** Crossfade transition duration in ms (default: 300) */
  transition?: number;
  /** Additional styles */
  style?: StyleProp<ImageStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
}

/**
 * Progressive image loading with blurhash placeholder and crossfade.
 *
 * Uses expo-image's built-in blurhash decode + crossfade transition.
 * Wrapped in memo() for use in FlashList/FlatList without unnecessary re-renders.
 * recyclingKey prevents image flicker when FlashList recycles cells.
 *
 * Usage:
 *   <ProgressiveImage uri={post.mediaUrls[0]} width="100%" height={300} borderRadius={12} />
 *   <ProgressiveImage uri={url} blurhash={item.blurhash} width={160} height={160} />
 *   <ProgressiveImage uri={url} blurhash={null} width="100%" height={200} />  // no placeholder
 */
export const ProgressiveImage = memo(function ProgressiveImage({
  uri,
  blurhash,
  width,
  height,
  borderRadius = 0,
  contentFit = 'cover',
  transition = 300,
  style,
  accessibilityLabel,
}: ProgressiveImageProps) {
  return (
    <Image
      source={{ uri }}
      placeholder={
        blurhash !== null
          ? { blurhash: blurhash ?? BLURHASH_POST }
          : undefined
      }
      transition={transition}
      contentFit={contentFit}
      style={[{ width, height, borderRadius }, style]}
      accessibilityLabel={accessibilityLabel}
      recyclingKey={uri}
    />
  );
});
