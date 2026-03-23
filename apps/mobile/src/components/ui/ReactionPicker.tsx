import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { formatCount } from '@/utils/formatCount';
import { colors, spacing, fontSize, radius, animation } from '@/theme';

/**
 * Reaction type identifiers used throughout the app.
 * Maps to backend reaction types when wired.
 */
export type ReactionType = 'LOVE' | 'FIRE' | 'CLAP' | 'LAUGH' | 'AMAZING' | 'SAD';

interface ReactionConfig {
  type: ReactionType;
  icon: IconName;
  color: string;
  fill?: string;
  labelKey: string;
}

const REACTIONS: ReactionConfig[] = [
  { type: 'LOVE', icon: 'heart-filled', color: colors.like, fill: colors.like, labelKey: 'reactions.love' },
  { type: 'FIRE', icon: 'trending-up', color: colors.gold, labelKey: 'reactions.fire' },
  { type: 'CLAP', icon: 'check-check', color: colors.emerald, labelKey: 'reactions.clap' },
  { type: 'LAUGH', icon: 'smile', color: colors.warning, labelKey: 'reactions.laugh' },
  { type: 'AMAZING', icon: 'star', color: '#E879A8', labelKey: 'reactions.amazing' },
  { type: 'SAD', icon: 'droplet', color: colors.info, labelKey: 'reactions.sad' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ReactionButtonProps {
  config: ReactionConfig;
  count?: number;
  isSelected: boolean;
  onPress: () => void;
}

const ReactionButton = memo(function ReactionButton({
  config,
  count,
  isSelected,
  onPress,
}: ReactionButtonProps) {
  const tc = useThemeColors();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.85, animation.spring.bouncy);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, animation.spring.bouncy);
  }, [scale]);

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withTiming(0.7, { duration: 80 }),
      withSpring(1.2, animation.spring.fluid),
      withSpring(1.0, animation.spring.responsive),
    );
    onPress();
  }, [scale, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[
        styles.reactionButton,
        isSelected && [
          styles.reactionButtonSelected,
          { borderColor: colors.emerald },
        ],
        animatedStyle,
      ]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Icon
        name={config.icon}
        size={20}
        color={isSelected ? config.color : tc.text.secondary}
        fill={isSelected && config.fill ? config.fill : undefined}
      />
      {count !== undefined && count > 0 && (
        <Text
          style={[
            styles.reactionCount,
            { color: isSelected ? config.color : tc.text.tertiary },
          ]}
        >
          {formatCount(count)}
        </Text>
      )}
    </AnimatedPressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ReactionPicker — main exported component
// ─────────────────────────────────────────────────────────────────────────────

interface ReactionPickerProps {
  /** Called when a reaction is tapped. Passes the reaction type string. */
  onReact: (type: ReactionType) => void;
  /** Reaction type → count mapping for display. */
  counts?: Partial<Record<ReactionType, number>>;
  /** The reaction the current user has selected, if any. */
  userReaction?: ReactionType | string;
  /** Compact mode reduces padding for inline use (e.g. under comments). */
  compact?: boolean;
}

export const ReactionPicker = memo(function ReactionPicker({
  onReact,
  counts,
  userReaction,
  compact = false,
}: ReactionPickerProps) {
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();

  const handleReact = useCallback(
    (type: ReactionType) => {
      haptic.like();
      onReact(type);
    },
    [haptic, onReact],
  );

  const content = (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { borderColor: tc.isDark ? colors.glass.border : tc.borderLight },
      ]}
    >
      {REACTIONS.map((reaction) => (
        <ReactionButton
          key={reaction.type}
          config={reaction}
          count={counts?.[reaction.type]}
          isSelected={userReaction === reaction.type}
          onPress={() => handleReact(reaction.type)}
        />
      ))}
    </View>
  );

  // Glassmorphism background on iOS, solid fallback on Android
  if (Platform.OS === 'ios' && !compact) {
    return (
      <View style={styles.glassWrapper}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass.light }]} />
        {content}
      </View>
    );
  }

  return (
    <View
      style={[
        !compact && styles.solidWrapper,
        !compact && {
          backgroundColor: tc.isDark
            ? 'rgba(13, 17, 23, 0.92)'
            : tc.bgElevated,
        },
      ]}
    >
      {content}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  glassWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  solidWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  containerCompact: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  reactionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 40,
    gap: 2,
  },
  reactionButtonSelected: {
    backgroundColor: colors.active.emerald10,
  },
  reactionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 1,
  },
});
