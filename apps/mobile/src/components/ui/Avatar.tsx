import { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, avatar as avatarSizes, animation, radius } from '@/theme';
import { imagePresets } from '@/utils/image';
import { BLURHASH_AVATAR } from '@/utils/blurhash';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: Size;
  showRing?: boolean;
  ringColor?: string;
  showOnline?: boolean;
  showStoryRing?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Per-content blurhash string from API. Falls back to default avatar blurhash. */
  blurhash?: string | null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Avatar = memo(function Avatar({
  uri,
  name,
  size = 'md',
  showRing,
  ringColor,
  showOnline,
  showStoryRing,
  onPress,
  accessibilityLabel,
  blurhash,
}: AvatarProps) {
  const dim = avatarSizes[size];
  const textSize = dim * 0.4;
  // Use CDN-optimized image sized to the avatar dimension
  const optimizedUri = uri ? imagePresets.avatar(uri, dim <= 64 ? 'sm' : dim <= 128 ? 'md' : 'lg') : undefined;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) scale.value = withSpring(0.92, animation.spring.bouncy);
  };

  const handlePressOut = () => {
    if (onPress) scale.value = withSpring(1, animation.spring.bouncy);
  };

  const ringWidth = showRing || showStoryRing ? 2.5 : 0;
  const ringPadding = showRing || showStoryRing ? 2 : 0;
  const innerDim = dim - (ringWidth + ringPadding) * 2;
  const onlineDotSize = Math.max(10, dim * 0.22);

  const content = (
    <>
      {showStoryRing ? (
        <LinearGradient
          colors={[colors.goldLight, colors.emerald, colors.emeraldDark]}
          start={{ x: 0.2, y: 1 }}
          end={{ x: 0.8, y: 0 }}
          style={[
            styles.ringGradient,
            {
              width: dim,
              height: dim,
              borderRadius: radius.full,
              padding: ringWidth,
            },
          ]}
        >
          <View style={[styles.ringInner, { borderRadius: radius.full }]}>
            <View
              style={[
                styles.inner,
                {
                  width: innerDim,
                  height: innerDim,
                  borderRadius: radius.full,
                },
              ]}
            >
              {uri ? (
                <Image
                  source={{ uri: optimizedUri }}
                  style={[styles.img, { width: innerDim, height: innerDim, borderRadius: radius.full }]}
                  contentFit="cover"
                  placeholder={{ blurhash: blurhash ?? BLURHASH_AVATAR }}
                  transition={300}
                />
              ) : (
                <Text style={[styles.fallback, { fontSize: textSize }]}>
                  {name?.[0]?.toUpperCase() ?? '?'}
                </Text>
              )}
            </View>
          </View>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.wrap,
            { width: dim, height: dim, borderRadius: radius.full },
            showRing && {
              borderWidth: ringWidth,
              borderColor: ringColor ?? colors.emerald,
              padding: ringPadding,
            },
          ]}
        >
          <View
            style={[
              styles.inner,
              {
                width: showRing ? innerDim : dim,
                height: showRing ? innerDim : dim,
                borderRadius: radius.full,
              },
            ]}
          >
            {uri ? (
              <Image
                source={{ uri: optimizedUri }}
                style={[
                  styles.img,
                  {
                    width: showRing ? innerDim : dim,
                    height: showRing ? innerDim : dim,
                    borderRadius: radius.full,
                  },
                ]}
                contentFit="cover"
              />
            ) : (
              <Text style={[styles.fallback, { fontSize: textSize }]}>
                {name?.[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>
        </View>
      )}

      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: onlineDotSize,
              height: onlineDotSize,
              borderRadius: radius.full,
              borderWidth: Math.max(2, onlineDotSize * 0.2),
              bottom: showRing ? 0 : -1,
              right: showRing ? 0 : -1,
            },
          ]}
        />
      )}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        style={[styles.container, animatedStyle]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={accessibilityLabel ?? (name ? `${name}'s avatar` : 'Avatar')}
        accessibilityRole="button"
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={styles.container} accessibilityLabel={name || undefined}>{content}</View>;
});

const styles = StyleSheet.create({
  container: { position: 'relative' },
  wrap: { overflow: 'hidden' },
  ringGradient: { overflow: 'hidden' },
  ringInner: {
    flex: 1,
    backgroundColor: colors.dark.bg,
    padding: 2,
  },
  inner: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: {},
  fallback: { color: colors.text.primary, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    backgroundColor: colors.online,
    borderColor: colors.dark.bg,
    shadowColor: colors.online,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
});
