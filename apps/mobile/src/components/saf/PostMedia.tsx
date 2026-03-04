import { useState } from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, animation } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MEDIA_HEIGHT = SCREEN_WIDTH;

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

  if (mediaUrls.length === 1) {
    return (
      <View style={[styles.single, { height }]}>
        <Image
          source={{ uri: mediaUrls[0] }}
          style={styles.fill}
          contentFit="cover"
          placeholder={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
          transition={200}
        />
      </View>
    );
  }

  return (
    <View style={[styles.carousel, { height }]}>
      <Image
        source={{ uri: mediaUrls[activeIndex] }}
        style={styles.fill}
        contentFit="cover"
        transition={150}
      />
      {/* Dot indicators */}
      <View style={styles.dots}>
        {mediaUrls.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
      {/* Navigation arrows */}
      {activeIndex > 0 && (
        <Pressable
          style={[styles.arrow, styles.arrowLeft]}
          onPress={() => setActiveIndex(activeIndex - 1)}
        >
          <Icon name="chevron-left" size="sm" color="#FFF" />
        </Pressable>
      )}
      {activeIndex < mediaUrls.length - 1 && (
        <Pressable
          style={[styles.arrow, styles.arrowRight]}
          onPress={() => setActiveIndex(activeIndex + 1)}
        >
          <Icon name="chevron-right" size="sm" color="#FFF" />
        </Pressable>
      )}
      {/* Counter */}
      <View style={styles.counter}>
        <Icon name="layers" size={12} color="#FFF" />
        <Animated.Text style={styles.counterText}>
          {activeIndex + 1}/{mediaUrls.length}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: { width: SCREEN_WIDTH },
  carousel: { width: SCREEN_WIDTH },
  fill: { width: '100%', height: '100%' },
  dots: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  arrow: {
    position: 'absolute', top: '50%', marginTop: -18,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 18,
  },
  arrowLeft: { left: 8 },
  arrowRight: { right: 8 },
  counter: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
