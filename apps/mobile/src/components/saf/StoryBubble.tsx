import { useEffect, memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, animation } from '@/theme';
import type { StoryGroup } from '@/types';

interface Props {
  group: StoryGroup;
  onPress: () => void;
  isOwn?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const StoryBubble = memo(function StoryBubble({ group, onPress, isOwn }: Props) {
  const { user, hasUnread } = group;
  const haptic = useHaptic();
  const scale = useSharedValue(1);
  const addPulse = useSharedValue(1);

  // Pulse animation for "add story" button when no story exists
  useEffect(() => {
    if (isOwn && (!group.stories || group.stories.length === 0)) {
      addPulse.value = withRepeat(
        withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [isOwn, group.stories, addPulse]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addPulse.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, animation.spring.bouncy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, animation.spring.bouncy);
  };

  const handlePress = () => {
    haptic.light();
    onPress();
  };

  return (
    <AnimatedPressable
      style={[styles.wrap, pressStyle]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={isOwn ? 'Add story' : `${user.displayName}'s story`}
      accessibilityRole="button"
    >
      <Avatar
        uri={user.avatarUrl}
        name={user.displayName}
        size="lg"
        showStoryRing={hasUnread}
        showRing={!hasUnread && !isOwn}
        ringColor={colors.dark.borderLight}
      />
      {isOwn && (
        <Animated.View style={[styles.addBtn, pulseStyle]}>
          <Icon name="plus" size={12} color="#FFF" strokeWidth={3} />
        </Animated.View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {isOwn ? 'Your Story' : user.username}
      </Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs, width: 72 },
  addBtn: {
    position: 'absolute',
    bottom: 18,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.dark.bg,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  name: { color: colors.text.secondary, fontSize: fontSize.xs, textAlign: 'center' },
});
