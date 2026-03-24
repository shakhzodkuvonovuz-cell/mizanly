import { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

interface SchedulePostSheetProps {
  visible: boolean;
  onClose: () => void;
  onSchedule: (isoDate: string) => void;
  onClearSchedule?: () => void;
  currentSchedule?: string | null;
}

// Time slots are static — generated once at module load (they don't depend on current time)
const TIME_SLOTS: { label: string; hours: number; minutes: number }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_SLOTS.push({ label: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, hours: h, minutes: m });
  }
}

export function SchedulePostSheet({
  visible,
  onClose,
  onSchedule,
  onClearSchedule,
  currentSchedule,
}: SchedulePostSheetProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  // Date options regenerated when sheet opens (not frozen at module load)
  const dateOptions = useMemo(() => {
    const options: { label: string; date: Date }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const label = i === 0 ? t('schedule.today') : i === 1 ? t('schedule.tomorrow') : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      options.push({ label, date: d });
    }
    return options;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, t]); // Regenerate when sheet opens

  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedTimeIdx, setSelectedTimeIdx] = useState(() => {
    const now = new Date();
    const nextHour = now.getHours() + 1;
    return Math.min(TIME_SLOTS.findIndex((s) => s.hours >= nextHour) || 0, TIME_SLOTS.length - 1);
  });

  // Reset selections when sheet opens (dates may have shifted)
  useEffect(() => {
    if (visible) {
      setSelectedDateIdx(0);
      const now = new Date();
      const nextHour = now.getHours() + 1;
      setSelectedTimeIdx(Math.min(TIME_SLOTS.findIndex((s) => s.hours >= nextHour) || 0, TIME_SLOTS.length - 1));
    }
  }, [visible]);

  const selectedDateTime = useMemo(() => {
    const d = new Date(dateOptions[selectedDateIdx]?.date ?? new Date());
    const time = TIME_SLOTS[selectedTimeIdx];
    d.setHours(time.hours, time.minutes, 0, 0);
    return d;
  }, [selectedDateIdx, selectedTimeIdx, dateOptions]);

  const isInPast = selectedDateTime.getTime() <= Date.now();

  const handleConfirm = () => {
    if (isInPast) return;
    haptic.success();
    onSchedule(selectedDateTime.toISOString());
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.header}>
          <View style={styles.handleBar} />
          <Icon name="clock" size="lg" color={colors.emerald} />
          <Text style={[styles.title, { color: tc.text.primary }]}>
            {t('schedule.title')}
          </Text>
          <Text style={[styles.subtitle, { color: tc.text.secondary }]}>
            {t('schedule.subtitle')}
          </Text>
        </Animated.View>

        {/* Date selector */}
        <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>
          {t('schedule.selectDate')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {dateOptions.map((opt, i) => (
            <Pressable
              key={i}
              onPress={() => { setSelectedDateIdx(i); haptic.tick(); }}
              style={[
                styles.dateChip,
                { borderColor: selectedDateIdx === i ? colors.emerald : tc.border },
                selectedDateIdx === i && { backgroundColor: `${colors.emerald}20` },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedDateIdx === i }}
            >
              <Text style={[
                styles.dateChipText,
                { color: selectedDateIdx === i ? colors.emerald : tc.text.primary },
              ]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Time selector */}
        <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>
          {t('schedule.selectTime')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
          {TIME_SLOTS.map((slot, i) => {
            const isPast = selectedDateIdx === 0 && (slot.hours < new Date().getHours() || (slot.hours === new Date().getHours() && slot.minutes <= new Date().getMinutes()));
            return (
              <Pressable
                key={i}
                onPress={() => { if (!isPast) { setSelectedTimeIdx(i); haptic.tick(); } }}
                disabled={isPast}
                style={[
                  styles.timeChip,
                  { borderColor: selectedTimeIdx === i ? colors.emerald : tc.border },
                  selectedTimeIdx === i && { backgroundColor: `${colors.emerald}20` },
                  isPast && { opacity: 0.3 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedTimeIdx === i }}
              >
                <Text style={[
                  styles.timeChipText,
                  { color: selectedTimeIdx === i ? colors.emerald : tc.text.primary },
                ]}>
                  {slot.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Summary */}
        <View style={[styles.summary, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
          <Icon name="clock" size="sm" color={colors.emerald} />
          <Text style={[styles.summaryText, { color: tc.text.primary }]}>
            {selectedDateTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {' '}
            {t('schedule.at')}
            {' '}
            <Text style={{ color: colors.emerald, fontFamily: fonts.bodyBold }}>
              {TIME_SLOTS[selectedTimeIdx].label}
            </Text>
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {currentSchedule && onClearSchedule && (
            <Pressable
              onPress={() => { haptic.delete(); onClearSchedule(); onClose(); }}
              style={[styles.clearBtn, { borderColor: tc.border }]}
              accessibilityRole="button"
            >
              <Icon name="x" size="sm" color={colors.error} />
              <Text style={[styles.clearText, { color: colors.error }]}>
                {t('schedule.removeSchedule')}
              </Text>
            </Pressable>
          )}
          <GradientButton
            label={isInPast ? t('schedule.selectFutureTime') : t('schedule.confirm')}
            onPress={handleConfirm}
            disabled={isInPast}
            icon="check"
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontFamily: fonts.bodyBold, fontWeight: '700' },
  subtitle: { fontSize: fontSize.sm, fontFamily: fonts.body },

  sectionLabel: { fontSize: fontSizeExt.caption, fontFamily: fonts.bodyMedium, fontWeight: '500', marginBottom: spacing.sm, marginTop: spacing.md },

  dateRow: { gap: spacing.sm, paddingEnd: spacing.base },
  dateChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1.5 },
  dateChipText: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium, fontWeight: '500' },

  timeRow: { gap: spacing.xs, paddingEnd: spacing.base },
  timeChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1 },
  timeChipText: { fontSize: fontSizeExt.caption, fontFamily: fonts.body },

  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.lg },
  summaryText: { fontSize: fontSize.base, fontFamily: fonts.body, flex: 1 },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1,
  },
  clearText: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium },
});
