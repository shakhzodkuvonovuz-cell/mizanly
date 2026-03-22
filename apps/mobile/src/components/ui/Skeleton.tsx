import { useEffect } from 'react';
import { View, StyleSheet, I18nManager, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

function ShimmerBase({ width, height, borderRadius = radius.sm, style }: {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const tc = useThemeColors();
  const reducedMotion = useReducedMotion();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    // Skip shimmer animation when reduced motion is enabled — show static loading state
    if (reducedMotion) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: animation.timing.shimmer, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [shimmer, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], I18nManager.isRTL ? [300, -300] : [-300, 300]) }],
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: tc.bgElevated,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: tc.borderLight,
        },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255, 255, 255, 0.05)',
            'rgba(255, 255, 255, 0.1)',
            'rgba(255, 255, 255, 0.05)',
            'transparent',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, { width: 300 }]}
        />
      </Animated.View>
    </View>
  );
}

function Circle({ size = 40, style }: { size?: number; style?: object }) {
  return <ShimmerBase width={size} height={size} borderRadius={size / 2} style={style} />;
}

function Rect({ width = '100%', height = 16, borderRadius: br = radius.sm, style }: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: object;
}) {
  return <ShimmerBase width={width} height={height} borderRadius={br} style={style} />;
}

function TextLine({ width = '100%', style }: { width?: DimensionValue; style?: object }) {
  return <ShimmerBase width={width} height={14} borderRadius={4} style={style} />;
}

function PostCard() {
  const tc = useThemeColors();
  return (
    <View style={[skeletonStyles.postCard, { backgroundColor: tc.bgCard, borderBottomColor: tc.border }]} accessibilityLabel="Loading post" accessibilityRole="progressbar">
      <View style={skeletonStyles.postHeader}>
        <Circle size={40} />
        <View style={skeletonStyles.postHeaderText}>
          <Rect width={120} height={14} />
          <Rect width={80} height={11} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Rect width="90%" height={14} style={{ marginTop: spacing.md }} />
      <Rect width="60%" height={14} style={{ marginTop: spacing.sm }} />
      <Rect width="100%" height={280} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
      <View style={skeletonStyles.postActions}>
        <Rect width={60} height={20} />
        <Rect width={60} height={20} />
        <Rect width={60} height={20} />
      </View>
    </View>
  );
}

function ThreadCard() {
  const tc = useThemeColors();
  return (
    <View style={[skeletonStyles.threadCard, { backgroundColor: tc.bgCard, borderBottomColor: tc.border }]} accessibilityLabel="Loading thread" accessibilityRole="progressbar">
      <Circle size={40} />
      <View style={skeletonStyles.threadContent}>
        <View style={skeletonStyles.threadHeader}>
          <Rect width={100} height={14} />
          <Rect width={50} height={11} />
        </View>
        <Rect width="100%" height={14} style={{ marginTop: spacing.sm }} />
        <Rect width="80%" height={14} style={{ marginTop: spacing.xs }} />
        <View style={skeletonStyles.postActions}>
          <Rect width={40} height={18} />
          <Rect width={40} height={18} />
          <Rect width={40} height={18} />
        </View>
      </View>
    </View>
  );
}

function ConversationItem() {
  return (
    <View style={skeletonStyles.convoItem} accessibilityLabel="Loading conversation" accessibilityRole="progressbar">
      <Circle size={52} />
      <View style={skeletonStyles.convoContent}>
        <View style={skeletonStyles.convoRow}>
          <Rect width={120} height={14} />
          <Rect width={30} height={11} />
        </View>
        <Rect width="70%" height={12} style={{ marginTop: spacing.xs }} />
      </View>
    </View>
  );
}

function ProfileHeader() {
  return (
    <View style={skeletonStyles.profileHeader} accessibilityLabel="Loading profile" accessibilityRole="progressbar">
      <Rect width="100%" height={140} borderRadius={0} />
      <View style={skeletonStyles.profileAvatarRow}>
        <Circle size={96} />
        <Rect width={90} height={34} borderRadius={radius.md} />
      </View>
      <View style={skeletonStyles.profileInfo}>
        <Rect width={150} height={20} />
        <Rect width={100} height={14} style={{ marginTop: spacing.sm }} />
        <Rect width="80%" height={14} style={{ marginTop: spacing.md }} />
      </View>
    </View>
  );
}

export const Skeleton = {
  Circle,
  Rect,
  Text: TextLine,
  PostCard,
  ThreadCard,
  ConversationItem,
  ProfileHeader,
};

const skeletonStyles = StyleSheet.create({
  // TODO: colors.dark.bgCard/border overridden by inline style with tc.bgCard/tc.border from useThemeColors()
  postCard: {
    padding: spacing.base,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    backgroundColor: colors.dark.bgCard,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postHeaderText: { flex: 1 },
  postActions: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  // TODO: colors.dark.bgCard/border overridden by inline style with tc.bgCard/tc.border from useThemeColors()
  threadCard: {
    flexDirection: 'row',
    padding: spacing.base,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    backgroundColor: colors.dark.bgCard,
  },
  threadContent: { flex: 1 },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  convoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.md,
  },
  convoContent: { flex: 1 },
  convoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileHeader: {},
  profileAvatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginTop: -36,
  },
  profileInfo: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
  },
});
