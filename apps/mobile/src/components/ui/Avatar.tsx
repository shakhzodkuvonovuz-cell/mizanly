import { memo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, avatar as avatarSizes, animation, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
  /** When true, story ring renders as static gray (viewed). Default: false. */
  storyViewed?: boolean;
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
  storyViewed = false,
  onPress,
  accessibilityLabel,
  blurhash,
}: AvatarProps) {
  const tc = useThemeColors();
  const reducedMotion = useReducedMotion();
  const dim = avatarSizes[size];
  const textSize = dim * 0.4;
  // Use CDN-optimized image sized to the avatar dimension, with fallback to raw URI on CDN error
  const cdnUri = uri ? imagePresets.avatar(uri, dim <= 64 ? 'sm' : dim <= 128 ? 'md' : 'lg') : undefined;
  const [cdnFailed, setCdnFailed] = useState(false);
  const optimizedUri = cdnFailed ? uri : cdnUri;
  const onImageError = useCallback(() => {
    if (!cdnFailed && cdnUri !== uri) setCdnFailed(true);
  }, [cdnFailed, cdnUri, uri]);
  const scale = useSharedValue(1);

  // Ring rotation for unseen stories (continuous, like Instagram)
  const ringRotation = useSharedValue(0);

  useEffect(() => {
    if (showStoryRing && !storyViewed && !reducedMotion) {
      ringRotation.value = 0;
      ringRotation.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1, // infinite
        false, // no reverse
      );
    } else {
      ringRotation.value = 0;
    }
  }, [showStoryRing, storyViewed, reducedMotion, ringRotation]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value * 360}deg` }],
  }));

  // Online dot pulse animation
  const onlinePulse = useSharedValue(1);

  useEffect(() => {
    if (showOnline && !reducedMotion) {
      onlinePulse.value = 1;
      onlinePulse.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1, // infinite
        false, // no reverse — sequence already goes up then down
      );
    } else {
      onlinePulse.value = 1;
    }
  }, [showOnline, reducedMotion, onlinePulse]);

  const onlinePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: onlinePulse.value }],
  }));

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

  /** Renders the avatar image or fallback initials */
  const renderAvatarContent = (contentDim: number) =>
    uri ? (
      <Image
        source={{ uri: optimizedUri }}
        style={[styles.img, { width: contentDim, height: contentDim, borderRadius: radius.full }]}
        contentFit="cover"
        placeholder={{ blurhash: blurhash ?? BLURHASH_AVATAR }}
        transition={300}
        onError={onImageError}
      />
    ) : (
      <Text style={[styles.fallback, { fontSize: textSize, color: tc.text.primary }]}>
        {name?.[0]?.toUpperCase() ?? '?'}
      </Text>
    );

  const content = (
    <>
      {showStoryRing && !storyViewed ? (
        /* Unseen story: rotating emerald→gold gradient ring */
        <Animated.View style={[{ width: dim, height: dim }, ringAnimatedStyle]}>
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
            <View style={[styles.ringInner, { borderRadius: radius.full, backgroundColor: tc.bg }]}>
              <View
                style={[
                  styles.inner,
                  {
                    width: innerDim,
                    height: innerDim,
                    borderRadius: radius.full,
                    backgroundColor: tc.surface,
                  },
                ]}
              >
                {renderAvatarContent(innerDim)}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      ) : showStoryRing && storyViewed ? (
        /* Viewed story: static gray ring */
        <View
          style={[
            styles.wrap,
            {
              width: dim,
              height: dim,
              borderRadius: radius.full,
              borderWidth: ringWidth,
              borderColor: tc.text.tertiary,
              padding: ringPadding,
            },
          ]}
        >
          <View
            style={[
              styles.inner,
              {
                width: innerDim,
                height: innerDim,
                borderRadius: radius.full,
                backgroundColor: tc.surface,
              },
            ]}
          >
            {renderAvatarContent(innerDim)}
          </View>
        </View>
      ) : (
        /* No story ring: plain avatar (with optional showRing border) */
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
                backgroundColor: tc.surface,
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
                onError={onImageError}
              />
            ) : (
              <Text style={[styles.fallback, { fontSize: textSize, color: tc.text.primary }]}>
                {name?.[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>
        </View>
      )}

      {showOnline && (
        <Animated.View
          style={[
            styles.onlineDot,
            {
              width: onlineDotSize,
              height: onlineDotSize,
              borderRadius: radius.full,
              borderWidth: Math.max(2, onlineDotSize * 0.2),
              borderColor: tc.bg,
              bottom: showRing || showStoryRing ? 0 : -1,
              end: showRing || showStoryRing ? 0 : -1,
            },
            onlinePulseStyle,
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

  return <View style={styles.container} accessibilityRole="image" accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}>{content}</View>;
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
  fallback: { color: colors.text.primary, fontFamily: fonts.bodyBold },
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
