import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, animation } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { promotionsApi } from '@/services/promotionsApi';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ReminderButtonProps {
  postId: string;
  hasReminder: boolean;
  onToggle: (set: boolean) => void;
}

export function ReminderButton({ postId, hasReminder, onToggle }: ReminderButtonProps) {
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.85, animation.spring.snappy);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, animation.spring.snappy);
  }, [scale]);

  const setReminderWithOffset = useCallback(
    async (hoursOffset: number) => {
      const remindAt = new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
      try {
        await promotionsApi.setReminder(postId, remindAt);
        onToggle(true);
        haptic.success();
      } catch {
        Alert.alert(t('common.error'), t('reminder.setError'));
      }
    },
    [postId, onToggle, haptic, t],
  );

  const handleRemoveReminder = useCallback(async () => {
    try {
      await promotionsApi.removeReminder(postId);
      onToggle(false);
      haptic.delete();
    } catch {
      Alert.alert(t('common.error'), t('reminder.removeError'));
    }
  }, [postId, onToggle, haptic, t]);

  const handlePress = useCallback(() => {
    haptic.tick();
    if (hasReminder) {
      Alert.alert(
        t('reminder.removeTitle'),
        t('reminder.removeMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('reminder.remove'), style: 'destructive', onPress: handleRemoveReminder },
        ],
      );
      return;
    }

    Alert.alert(t('reminder.setTitle'), t('reminder.setMessage'), [
      { text: t('reminder.in1Hour'), onPress: () => setReminderWithOffset(1) },
      { text: t('reminder.in3Hours'), onPress: () => setReminderWithOffset(3) },
      { text: t('reminder.tomorrow'), onPress: () => setReminderWithOffset(24) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [hasReminder, haptic, t, handleRemoveReminder, setReminderWithOffset]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.button, hasReminder && styles.buttonActive, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={hasReminder ? t('reminder.removeLabel') : t('reminder.setLabel')}
      accessibilityState={{ selected: hasReminder }}
      hitSlop={8}
    >
      <Icon
        name="bell"
        size="sm"
        color={hasReminder ? colors.emerald : colors.text.secondary}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  buttonActive: {
    backgroundColor: colors.active.emerald10,
  },
});
