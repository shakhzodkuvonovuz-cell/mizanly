import { useState } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MEDIA_HEIGHT = SCREEN_WIDTH; // 1:1 square

interface Props {
  mediaUrls: string[];
  mediaTypes: string[];
  thumbnailUrl?: string;
  aspectRatio?: number;
}

export function PostMedia({ mediaUrls, mediaTypes, thumbnailUrl, aspectRatio }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!mediaUrls.length) return null;

  const height = aspectRatio ? SCREEN_WIDTH / aspectRatio : MEDIA_HEIGHT;

  // Single media
  if (mediaUrls.length === 1) {
    return (
      <View style={[styles.single, { height }]}>
        <Image
          source={{ uri: mediaUrls[0] }}
          style={styles.fill}
          contentFit="cover"
          placeholder={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
        />
      </View>
    );
  }

  // Carousel
  return (
    <View style={[styles.carousel, { height }]}>
      <Image
        source={{ uri: mediaUrls[activeIndex] }}
        style={styles.fill}
        contentFit="cover"
      />
      {/* Dot indicators */}
      <View style={styles.dots}>
        {mediaUrls.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
      {/* Navigation arrows */}
      {activeIndex > 0 && (
        <TouchableOpacity
          style={[styles.arrow, styles.arrowLeft]}
          onPress={() => setActiveIndex(activeIndex - 1)}
        >
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
      )}
      {activeIndex < mediaUrls.length - 1 && (
        <TouchableOpacity
          style={[styles.arrow, styles.arrowRight]}
          onPress={() => setActiveIndex(activeIndex + 1)}
        >
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      )}
      {/* Counter */}
      <View style={styles.counter}>
        <Text style={styles.counterText}>{activeIndex + 1}/{mediaUrls.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: { width: SCREEN_WIDTH },
  carousel: { width: SCREEN_WIDTH },
  fill: { width: '100%', height: '100%' },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff' },
  arrow: {
    position: 'absolute', top: '50%', marginTop: -20,
    width: 32, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.sm,
  },
  arrowLeft: { left: 8 },
  arrowRight: { right: 8 },
  arrowText: { color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 },
  counter: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
