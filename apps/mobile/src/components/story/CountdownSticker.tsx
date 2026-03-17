import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { Icon } from '@/components/ui/Icon';

export interface CountdownStickerData {
  eventName: string;
  targetDate: Date;
  description?: string;
}

interface CountdownStickerProps {
  data: CountdownStickerData;
  onRemindMeToggle?: (enabled: boolean) => void;
  isCreator?: boolean;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CountdownSticker({ data, onRemindMeToggle, isCreator = false, style }: CountdownStickerProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isReminded, setIsReminded] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  const pulse = useSharedValue(1);
  const glow = useSharedValue(0);

  const targetTime = new Date(data.targetDate).getTime();

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = targetTime - now;
      if (diff <= 0) {
        setTimeLeft(0);
        setHasEnded(true);
        return;
      }
      setTimeLeft(diff);
      setHasEnded(false);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  useEffect(() => {
    if (hasEnded) {
      pulse.value = withSpring(1, animation.spring.gentle);
      glow.value = withTiming(0, { duration: 300 });
      return;
    }

    const hoursLeft = timeLeft / (1000 * 60 * 60);
    if (hoursLeft < 1) {
      // Start pulsing when < 1 hour
      pulse.value = withRepeat(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      glow.value = withTiming(1, { duration: 500 });
    } else {
      pulse.value = withSpring(1, animation.spring.gentle);
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [timeLeft, hasEnded, pulse, glow]);

  const formatTime = (ms: number) => {
    if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return { days, hours, minutes, seconds };
  };

  const { days, hours, minutes, seconds } = formatTime(timeLeft);

  const handleRemindMeToggle = () => {
    const newState = !isReminded;
    setIsReminded(newState);
    if (onRemindMeToggle) {
      onRemindMeToggle(newState);
    }
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glow.value * 0.4,
    shadowRadius: glow.value * 20,
    elevation: glow.value * 8,
  }));

  return (
    <Animated.View style={[styles.container, pulseStyle, glowStyle, style]}>
      <View style={styles.header}>
        <Icon name="clock" size="lg" color={colors.gold} />
        <Text style={styles.eventName}>{data.eventName}</Text>
      </View>

      {data.description && (
        <Text style={styles.description}>{data.description}</Text>
      )}

      {hasEnded ? (
        <View style={styles.endedContainer}>
          <Text style={styles.endedTitle}>🎉 Event started!</Text>
          <Text style={styles.endedSubtitle}>
            The countdown is over. Enjoy the event!
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.countdownGrid}>
            <View style={styles.timeUnit}>
              <Text style={styles.timeNumber}>{days.toString().padStart(2, '0')}</Text>
              <Text style={styles.timeLabel}>Days</Text>
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.timeUnit}>
              <Text style={styles.timeNumber}>{hours.toString().padStart(2, '0')}</Text>
              <Text style={styles.timeLabel}>Hours</Text>
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.timeUnit}>
              <Text style={styles.timeNumber}>{minutes.toString().padStart(2, '0')}</Text>
              <Text style={styles.timeLabel}>Mins</Text>
            </View>
            <Text style={styles.colon}>:</Text>
            <View style={styles.timeUnit}>
              <Text style={styles.timeNumber}>{seconds.toString().padStart(2, '0')}</Text>
              <Text style={styles.timeLabel}>Secs</Text>
            </View>
          </View>

          <Pressable
            style={[styles.remindButton, isReminded && styles.remindButtonActive]}
            onPress={handleRemindMeToggle}
            accessibilityLabel={isReminded ? 'Turn off reminder' : 'Remind me about this event'}
            accessibilityRole="button"
          >
            <Icon
              name={isReminded ? 'check-circle' : 'bell'}
              size="sm"
              color={isReminded ? colors.emerald : colors.text.secondary}
            />
            <Text style={[
              styles.remindText,
              isReminded && styles.remindTextActive,
            ]}>
              {isReminded ? 'Reminder set' : 'Remind me'}
            </Text>
          </Pressable>
        </>
      )}

      {isCreator && (
        <View style={styles.creatorBadge}>
          <Icon name="eye" size="xs" color={colors.text.secondary} />
          <Text style={styles.creatorText}>Creator view</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.gold,
    width: 300,
    maxWidth: '100%',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  eventName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  description: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  countdownGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  timeUnit: {
    alignItems: 'center',
    minWidth: 50,
  },
  timeNumber: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  colon: {
    color: colors.gold,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  endedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  endedTitle: {
    color: colors.gold,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  endedSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  remindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  remindButtonActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  remindText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  remindTextActive: {
    color: colors.emerald,
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.white5,
    borderRadius: radius.full,
    alignSelf: 'center',
  },
  creatorText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
});