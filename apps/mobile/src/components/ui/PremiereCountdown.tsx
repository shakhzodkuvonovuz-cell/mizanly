import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet , Pressable } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

interface PremiereCountdownProps {
  scheduledAt: string;
  reminderCount: number;
  viewerCount: number;
  countdownTheme: string;
  isReminderSet: boolean;
  onSetReminder: () => void;
  onRemoveReminder: () => void;
}

function getTimeRemaining(scheduledAt: string) {
  const diff = new Date(scheduledAt).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  };
}

const THEME_COLORS: Record<string, [string, string]> = {
  emerald: [colors.emerald, '#0D9B63'],
  gold: [colors.gold, '#D4A94F'],
  cosmic: ['#7C3AED', '#4F46E5'],
};

export function PremiereCountdown({
  scheduledAt,
  reminderCount,
  viewerCount,
  countdownTheme,
  isReminderSet,
  onSetReminder,
  onRemoveReminder,
}: PremiereCountdownProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const [time, setTime] = useState(getTimeRemaining(scheduledAt));
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeRemaining(scheduledAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [scheduledAt]);

  useEffect(() => {
    if (time.expired) {
      pulseScale.value = withRepeat(withTiming(1.1, { duration: 600 }), -1, true);
    }
  }, [time.expired]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const themeColors = THEME_COLORS[countdownTheme] || THEME_COLORS.emerald;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <LinearGradient
        colors={[themeColors[0] + '20', 'transparent']}
        style={styles.glow}
      />

      {time.expired ? (
        <Animated.View style={[styles.liveBadge, pulseStyle]}>
          <LinearGradient colors={['#FF3B3B', '#E11D48']} style={styles.liveBadgeGradient}>
            <Text style={styles.liveText}>{t('premiere.liveNow')}</Text>
          </LinearGradient>
        </Animated.View>
      ) : (
        <>
          <Text style={styles.label}>{t('premiere.countdown')}</Text>
          <View style={styles.timeRow}>
            {time.days > 0 && (
              <View style={styles.timeBlock}>
                <Text style={[styles.timeNumber, { color: themeColors[0] }]}>{pad(time.days)}</Text>
                <Text style={styles.timeLabel}>d</Text>
              </View>
            )}
            <View style={styles.timeBlock}>
              <Text style={[styles.timeNumber, { color: themeColors[0] }]}>{pad(time.hours)}</Text>
              <Text style={styles.timeLabel}>h</Text>
            </View>
            <Text style={[styles.timeSep, { color: themeColors[0] }]}>:</Text>
            <View style={styles.timeBlock}>
              <Text style={[styles.timeNumber, { color: themeColors[0] }]}>{pad(time.minutes)}</Text>
              <Text style={styles.timeLabel}>m</Text>
            </View>
            <Text style={[styles.timeSep, { color: themeColors[0] }]}>:</Text>
            <View style={styles.timeBlock}>
              <Text style={[styles.timeNumber, { color: themeColors[0] }]}>{pad(time.seconds)}</Text>
              <Text style={styles.timeLabel}>s</Text>
            </View>
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.reminderBtn, isReminderSet && { borderColor: colors.gold }]}
          onPress={() => {
            haptic.light();
            isReminderSet ? onRemoveReminder() : onSetReminder();
          }}
        >
          <Icon name="bell" size="sm" color={isReminderSet ? colors.gold : colors.text.secondary} />
          <Text style={[styles.reminderText, isReminderSet && { color: colors.gold }]}>
            {isReminderSet ? t('premiere.reminderSet') : t('premiere.setReminder')}
          </Text>
        </Pressable>

        <View style={styles.viewerBadge}>
          <Icon name="eye" size="xs" color={colors.text.secondary} />
          <Text style={styles.viewerText}>{t('premiere.viewers', { count: viewerCount + reminderCount })}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.xl,
    position: 'relative',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
  },
  label: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeNumber: {
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  timeSep: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  liveBadge: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  liveBadgeGradient: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  liveText: {
    color: '#FFF',
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: spacing.xl,
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  reminderText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewerText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
});
