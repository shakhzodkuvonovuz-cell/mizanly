import { useState, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius } from '@/theme';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { ImageGallery } from '@/components/ui/ImageGallery';

interface Props {
  mediaUrls: string[];
  mediaTypes: string[];
  thumbnailUrl?: string;
  aspectRatio?: number;
  blurred?: boolean;
}

export function PostMedia({ mediaUrls, mediaTypes, thumbnailUrl, aspectRatio, blurred }: Props) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  if (!mediaUrls.length) return null;

  const height = aspectRatio ? SCREEN_WIDTH / aspectRatio : SCREEN_WIDTH;

  const handleImagePress = useCallback((index: number) => {
    setGalleryIndex(index);
    setGalleryVisible(true);
  }, []);

  const handleCloseGallery = useCallback(() => {
    setGalleryVisible(false);
  }, []);

  let mediaElement;
  if (mediaUrls.length === 1) {
    mediaElement = (
      <View style={[styles.single, { height }]}>
        <Pressable onPress={() => handleImagePress(0)} style={styles.fill}>
          <Image
            source={{ uri: mediaUrls[0] }}
            style={[styles.fill, blurred && { opacity: 0.15 }]}
            contentFit="cover"
            placeholder={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
            transition={200}
            blurRadius={blurred ? 30 : 0}
          />
        </Pressable>
      </View>
    );
  } else {
    mediaElement = (
      <ImageCarousel
        images={mediaUrls}
        height={height}
        onImagePress={handleImagePress}
        blurred={blurred}
        borderRadius={radius.lg}
      />
    );
  }

  return (
    <>
      {mediaElement}
      <ImageGallery
        images={mediaUrls}
        initialIndex={galleryIndex}
        visible={galleryVisible}
        onClose={handleCloseGallery}
      />
    </>
  );
}

const styles = StyleSheet.create({
  single: { width: '100%' },
  fill: { width: '100%', height: '100%' },
});
