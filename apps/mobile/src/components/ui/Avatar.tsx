import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, avatar as avatarSizes, animation } from '@/theme';

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
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Avatar({
  uri,
  name,
  size = 'md',
  showRing,
  ringColor,
  showOnline,
  showStoryRing,
  onPress,
  accessibilityLabel,
}: AvatarProps) {
  const dim = avatarSizes[size];
  const textSize = dim * 0.4;
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
              borderRadius: dim / 2,
              padding: ringWidth,
            },
          ]}
        >
          <View style={[styles.ringInner, { borderRadius: (dim - ringWidth * 2) / 2 }]}>
            <View
              style={[
                styles.inner,
                {
                  width: innerDim,
                  height: innerDim,
                  borderRadius: innerDim / 2,
                },
              ]}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={[styles.img, { width: innerDim, height: innerDim, borderRadius: innerDim / 2 }]}
                  contentFit="cover"
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
            { width: dim, height: dim, borderRadius: dim / 2 },
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
                borderRadius: (showRing ? innerDim : dim) / 2,
              },
            ]}
          >
            {uri ? (
              <Image
                source={{ uri }}
                style={[
                  styles.img,
                  {
                    width: showRing ? innerDim : dim,
                    height: showRing ? innerDim : dim,
                    borderRadius: (showRing ? innerDim : dim) / 2,
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
              borderRadius: onlineDotSize / 2,
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

  return <View style={styles.container}>{content}</View>;
}

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
