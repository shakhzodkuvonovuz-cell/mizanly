import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { Icon } from './Icon';
import { navigate } from '@/utils/navigation';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * Floating bar shown when an active call is in progress but the user
 * has navigated away from the call screen. Tap to return.
 */
export function CallActiveBar() {
  const { t } = useTranslation();
  const activeCallId = useStore(s => s.activeCallId);
  const activeCallName = useStore(s => s.activeCallName);
  const duration = useStore(s => s.activeCallDuration);

  if (!activeCallId) return null;

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <Pressable
      style={styles.bar}
      onPress={() => navigate(`/(screens)/call/${activeCallId}`)}
      accessibilityRole="button"
      accessibilityLabel={t('call.returnToCall', { name: activeCallName || t('call.user') })}
    >
      <View style={styles.dot} />
      <Icon name="phone" size="sm" color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {activeCallName || t('call.inProgress')}
      </Text>
      <Text style={styles.duration}>{durationText}</Text>
      <Text style={styles.tapHint}>{t('call.tapToReturn')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  text: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  duration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tapHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.xs,
  },
});
