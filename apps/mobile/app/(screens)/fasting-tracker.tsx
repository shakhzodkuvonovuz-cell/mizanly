import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { islamicApi } from '@/services/islamicApi';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FAST_TYPES = ['ramadan', 'monday', 'thursday', 'ayyam-al-bid', 'arafat', 'ashura', 'qada', 'nafl'];

interface FastingLog {
  id: string;
  date: string;
  isFasting: boolean;
  fastType: string;
  reason?: string;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CalendarDay({ day, isFasting, isMissed, isToday, isFuture }: {
  day: number;
  isFasting: boolean;
  isMissed: boolean;
  isToday: boolean;
  isFuture: boolean;
}) {
  const bg = isFasting ? colors.emerald
    : isMissed ? colors.error
    : isFuture ? 'transparent'
    : colors.dark.surface;

  return (
    <View style={[
      styles.calDay,
      { backgroundColor: bg },
      isToday && styles.calDayToday,
    ]}>
      <Text style={[
        styles.calDayText,
        isFuture && { color: colors.text.tertiary },
      ]}>
        {day > 0 ? day : ''}
      </Text>
    </View>
  );
}

export default function FastingTrackerScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const { t, isRTL } = useTranslation();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
  );

  const statsQuery = useQuery({
    queryKey: ['fasting-stats'],
    queryFn: () => islamicApi.getFastingStats().then(r => r.data),
  });

  const logQuery = useQuery({
    queryKey: ['fasting-log', currentMonth],
    queryFn: () => islamicApi.getFastingLog(currentMonth).then(r => r.data),
  });

  const logMutation = useMutation({
    mutationFn: (data: { date: string; isFasting: boolean; fastType?: string }) =>
      islamicApi.logFast(data),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['fasting-log'] });
      queryClient.invalidateQueries({ queryKey: ['fasting-stats'] });
    },
  });

  const logs: FastingLog[] = logQuery.data ?? [];
  const stats = statsQuery.data;

  const todayStr = today.toISOString().split('T')[0];
  const todayLog = logs.find(l => l.date?.startsWith(todayStr));

  const handleLogToday = useCallback((isFasting: boolean) => {
    haptic.medium();
    logMutation.mutate({ date: todayStr, isFasting, fastType: 'ramadan' });
  }, [todayStr, haptic, logMutation]);

  const handleRefresh = useCallback(() => {
    statsQuery.refetch();
    logQuery.refetch();
  }, [statsQuery, logQuery]);

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayDate = today.getDate();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

    const logMap = new Map<number, FastingLog>();
    for (const log of logs) {
      const d = new Date(log.date).getDate();
      logMap.set(d, log);
    }

    const grid: { day: number; isFasting: boolean; isMissed: boolean; isToday: boolean; isFuture: boolean }[] = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      grid.push({ day: 0, isFasting: false, isMissed: false, isToday: false, isFuture: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const log = logMap.get(d);
      const isFuture = isCurrentMonth && d > todayDate;
      grid.push({
        day: d,
        isFasting: log?.isFasting ?? false,
        isMissed: log ? !log.isFasting : false,
        isToday: isCurrentMonth && d === todayDate,
        isFuture,
      });
    }

    return grid;
  }, [currentMonth, logs, today]);

  const monthLabel = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentMonth]);

  const navigateMonth = useCallback((delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }, [currentMonth]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('fasting.tracker')}
          leftAction={{
            icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />,
            onPress: () => router.back(),
            accessibilityLabel: 'Go back',
          }}
        />

        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={statsQuery.isRefetching || logQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* Today's Prompt */}
          {!todayLog && (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.todayCard}>
              <Text style={[styles.todayTitle, { textAlign: rtlTextAlign(isRTL) }]}>
                {t('fasting.areYouFasting')}
              </Text>
              <View style={[styles.todayButtons, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Pressable
                  style={[styles.todayBtn, styles.todayBtnYes]}
                  onPress={() => handleLogToday(true)}
                  disabled={logMutation.isPending}
                  accessibilityLabel={t('fasting.yesFasting')}
                  accessibilityRole="button"
                >
                  <Icon name="check" size={18} color="#fff" />
                  <Text style={styles.todayBtnText}>{t('fasting.yesFasting')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.todayBtn, styles.todayBtnNo]}
                  onPress={() => handleLogToday(false)}
                  disabled={logMutation.isPending}
                  accessibilityLabel={t('fasting.notFasting')}
                  accessibilityRole="button"
                >
                  <Icon name="x" size={18} color={colors.text.primary} />
                  <Text style={styles.todayBtnTextNo}>{t('fasting.notFasting')}</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {todayLog && (
            <View style={[styles.todayCard, { borderColor: todayLog.isFasting ? colors.emerald : colors.dark.border }]}>
              <Text style={styles.todayStatusText}>
                {todayLog.isFasting ? t('fasting.yesFasting') : t('fasting.notFasting')}
              </Text>
            </View>
          )}

          {/* Stats */}
          {statsQuery.isLoading ? (
            <View style={styles.statsRow}>
              <Skeleton.Rect width="30%" height={70} borderRadius={radius.md} />
              <Skeleton.Rect width="30%" height={70} borderRadius={radius.md} />
              <Skeleton.Rect width="30%" height={70} borderRadius={radius.md} />
            </View>
          ) : stats ? (
            <View style={styles.statsRow}>
              <StatCard label={t('fasting.streak')} value={stats.currentStreak} color={colors.emerald} />
              <StatCard label={t('fasting.totalThisYear')} value={stats.totalFastsThisYear} />
              <StatCard label={t('fasting.makeupNeeded')} value={stats.makeupNeeded} color={stats.makeupNeeded > 0 ? colors.error : colors.text.secondary} />
            </View>
          ) : null}

          {/* Calendar */}
          <View style={styles.calendarSection}>
            <View style={[styles.calHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Pressable onPress={() => navigateMonth(-1)} hitSlop={12} accessibilityLabel="Previous month" accessibilityRole="button">
                <Icon name="chevron-left" size="md" color={colors.text.secondary} />
              </Pressable>
              <Text style={styles.calMonthLabel}>{monthLabel}</Text>
              <Pressable onPress={() => navigateMonth(1)} hitSlop={12} accessibilityLabel="Next month" accessibilityRole="button">
                <Icon name="chevron-right" size="md" color={colors.text.secondary} />
              </Pressable>
            </View>

            {/* Day labels */}
            <View style={styles.calWeekRow}>
              {DAYS_OF_WEEK.map((d, i) => (
                <Text key={i} style={styles.calWeekLabel}>{d}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.calGrid}>
              {calendarGrid.map((cell, i) => (
                <CalendarDay key={i} {...cell} />
              ))}
            </View>
          </View>

          {/* Sunnah Fasts Info */}
          <View style={styles.sunnahSection}>
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('fasting.sunnahFasts')}
            </Text>
            <View style={styles.sunnahItem}>
              <Icon name="check-circle" size={16} color={colors.emerald} />
              <Text style={styles.sunnahText}>{t('fasting.mondayThursday')}</Text>
            </View>
            <View style={styles.sunnahItem}>
              <Icon name="check-circle" size={16} color={colors.emerald} />
              <Text style={styles.sunnahText}>{t('fasting.whiteDays')}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scrollContent: { paddingBottom: spacing['2xl'] },
  todayCard: {
    margin: spacing.base,
    padding: spacing.lg,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  todayTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  todayButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  todayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  todayBtnYes: { backgroundColor: colors.emerald },
  todayBtnNo: { backgroundColor: colors.dark.surface },
  todayBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  todayBtnTextNo: { color: colors.text.primary, fontWeight: '600', fontSize: fontSize.sm },
  todayStatusText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  calendarSection: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  calMonthLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  calWeekLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  calDayToday: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  calDayText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  sunnahSection: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  sunnahItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sunnahText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
});
